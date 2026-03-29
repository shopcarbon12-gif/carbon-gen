package com.shopcarbon.collectionmapping.data

import com.google.gson.annotations.SerializedName

/** Mirrors the JSON from GET `/api/collection-mapping` (see web `MappingResponse`). */
data class MappingGetResponse(
    val ok: Boolean = false,
    val error: String? = null,
    val warning: String? = null,
    val shop: String? = null,
    val page: Int? = null,
    val pageSize: Int? = null,
    val total: Int? = null,
    val totalPages: Int? = null,
    val rows: List<MappingProductRow>? = null,
    val summary: MappingSummary? = null,
)

data class MappingSummary(
    @SerializedName("totalProducts") val totalProducts: Int? = null,
)

data class MappingProductRow(
    val id: String? = null,
    val title: String? = null,
    val image: String? = null,
    @SerializedName("representativeSku") val representativeSku: String? = null,
    val upc: String? = null,
    @SerializedName("mappingDecision") val mappingDecision: String? = null,
    @SerializedName("suggestedPaths") val suggestedPaths: List<String>? = null,
    @SerializedName("autoMappedPaths") val autoMappedPaths: List<String>? = null,
    @SerializedName("currentDirectCollections") val currentDirectCollections: List<String>? = null,
    val draft: MappingRowDraft? = null,
)

data class MappingRowDraft(
    @SerializedName("isReviewed") val isReviewed: Boolean? = null,
    @SerializedName("finalMenuPaths") val finalMenuPaths: List<String>? = null,
    @SerializedName("mappingDecision") val mappingDecision: String? = null,
    @SerializedName("collectionSyncStatus") val collectionSyncStatus: String? = null,
)
