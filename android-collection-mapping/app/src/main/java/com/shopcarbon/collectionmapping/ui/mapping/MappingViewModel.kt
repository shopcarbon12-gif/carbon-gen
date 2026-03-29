package com.shopcarbon.collectionmapping.ui.mapping

import android.app.Application
import android.widget.Toast
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.JsonObject
import com.shopcarbon.collectionmapping.ShopCarbonApplication
import com.shopcarbon.collectionmapping.data.CollectionMappingRepository
import com.shopcarbon.collectionmapping.data.MappingProductRow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MappingUiState(
    val loading: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
    val warning: String? = null,
    val shop: String? = null,
    val rows: List<MappingProductRow> = emptyList(),
    val page: Int = 1,
    val totalPages: Int = 1,
    val total: Int = 0,
    val search: String = "",
    val needsConfig: Boolean = false,
    /** Row ids marked reviewed (synced with server on load; POST on save). */
    val reviewedRowIds: Set<String> = emptySet(),
)

class MappingViewModel(
    application: Application,
    private val repository: CollectionMappingRepository,
) : AndroidViewModel(application) {

    private val preferences = (application as ShopCarbonApplication).preferences

    private val _ui = MutableStateFlow(
        MappingUiState(
            needsConfig = preferences.apiBaseUrl.contains("INVALID_CONFIGURE", ignoreCase = true),
        ),
    )
    val ui: StateFlow<MappingUiState> = _ui.asStateFlow()

    fun refreshConfigFromPreferences() {
        _ui.update {
            it.copy(needsConfig = preferences.apiBaseUrl.contains("INVALID_CONFIGURE", ignoreCase = true))
        }
    }

    fun setSearch(value: String) {
        _ui.update { it.copy(search = value) }
    }

    fun setRowReviewed(rowId: String, reviewed: Boolean) {
        val id = rowId.trim()
        if (id.isEmpty()) return
        _ui.update { s ->
            val next = s.reviewedRowIds.toMutableSet()
            if (reviewed) next.add(id) else next.remove(id)
            s.copy(reviewedRowIds = next)
        }
    }

    fun setAllReviewedOnPage(checked: Boolean) {
        _ui.update { s ->
            val ids = s.rows.mapNotNull { r -> r.id?.trim()?.takeIf { it.isNotEmpty() } }.toSet()
            val next = s.reviewedRowIds.toMutableSet()
            if (checked) next.addAll(ids) else next.removeAll(ids)
            s.copy(reviewedRowIds = next)
        }
    }

    private fun reviewedIdsFromRows(rows: List<MappingProductRow>): Set<String> =
        rows.mapNotNull { row ->
            val id = row.id?.trim()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            if (row.draft?.isReviewed == true) id else null
        }.toSet()

    fun load(refreshRemote: Boolean = false) {
        val snapshot = _ui.value
        if (snapshot.needsConfig || preferences.apiBaseUrl.contains("INVALID_CONFIGURE", ignoreCase = true)) {
            _ui.update {
                it.copy(
                    error = "Set API base URL in Settings or shopcarbon.api.base.url in local.properties, then rebuild or save.",
                )
            }
            return
        }
        viewModelScope.launch {
            val q = _ui.value.search
            _ui.update { it.copy(loading = true, error = null) }
            val result = repository.loadMapping(
                page = 1,
                pageSize = 50,
                search = q,
                sortField = "title",
                sortDir = "asc",
                shop = null,
                refreshProducts = refreshRemote,
                refreshCollections = refreshRemote,
            )
            result.fold(
                onSuccess = { resp ->
                    val rows = resp.rows.orEmpty()
                    _ui.update {
                        it.copy(
                            loading = false,
                            error = null,
                            warning = resp.warning?.takeIf { w -> w.isNotBlank() },
                            shop = resp.shop,
                            rows = rows,
                            page = resp.page ?: 1,
                            totalPages = resp.totalPages ?: 1,
                            total = resp.total ?: rows.size,
                            reviewedRowIds = reviewedIdsFromRows(rows),
                        )
                    }
                },
                onFailure = { e ->
                    _ui.update {
                        it.copy(
                            loading = false,
                            error = e.message ?: "Network error",
                        )
                    }
                },
            )
        }
    }

    fun saveDraftsForCurrentPage() {
        val snap = _ui.value
        if (snap.needsConfig) return
        val drafts = snap.rows.mapNotNull { row ->
            val id = row.id?.trim()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            val reviewed = id in snap.reviewedRowIds
            id to JsonObject().apply { addProperty("isReviewed", reviewed) }
        }
        if (drafts.isEmpty()) {
            toast("No rows with ids on this page to save.")
            return
        }
        viewModelScope.launch {
            _ui.update { it.copy(saving = true, error = null) }
            val result = repository.setRowDraftBatch(shop = null, drafts = drafts)
            _ui.update { it.copy(saving = false) }
            result.fold(
                onSuccess = {
                    toast("Saved ${drafts.size} draft(s).")
                    load(refreshRemote = false)
                },
                onFailure = { e ->
                    _ui.update { it.copy(error = e.message ?: "Save failed") }
                    toast(e.message ?: "Save failed")
                },
            )
        }
    }

    private fun toast(msg: String) {
        Toast.makeText(getApplication(), msg, Toast.LENGTH_SHORT).show()
    }
}
