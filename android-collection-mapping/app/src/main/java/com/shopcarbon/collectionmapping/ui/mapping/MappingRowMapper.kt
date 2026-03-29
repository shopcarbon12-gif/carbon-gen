package com.shopcarbon.collectionmapping.ui.mapping

import androidx.compose.ui.graphics.Color
import com.shopcarbon.collectionmapping.data.MappingProductRow

data class QueueRowPresentation(
    val imageUrl: String?,
    val title: String,
    val meta: String,
    val breadcrumb: String,
    val status: String,
    val statusColor: Color,
    val suggestedTitle: String,
    val isUnmapped: Boolean,
)

fun MappingProductRow.toPresentation(): QueueRowPresentation {
    val title = title?.trim().orEmpty().ifEmpty { "Untitled product" }
    val sku = representativeSku?.trim().orEmpty()
    val upc = upc?.trim().orEmpty()
    val meta = buildString {
        if (sku.isNotEmpty()) append("SKU: $sku")
        if (upc.isNotEmpty()) {
            if (isNotEmpty()) append(" • ")
            append("UPC: $upc")
        }
    }.ifEmpty { "—" }

    val decision = draft?.mappingDecision ?: mappingDecision
    val (status, color) = when (decision) {
        "AUTO_MAPPED" -> "AUTO-MATCHED" to Color(0xFFADC6FF)
        "SUGGESTED" -> "SUGGESTED" to Color(0xFF818CF8)
        "MANUAL_REVIEW" -> "NEEDS REVIEW" to Color(0xFFFFB95F)
        else -> "UNMAPPED" to Color(0xFF8C909F)
    }

    val pathCandidates = listOfNotNull(
        autoMappedPaths?.firstOrNull(),
        currentDirectCollections?.firstOrNull(),
        suggestedPaths?.firstOrNull(),
        draft?.finalMenuPaths?.firstOrNull(),
    )
    val breadcrumb = pathCandidates.firstOrNull()?.uppercase() ?: "—"

    val suggestedTitle = suggestedPaths?.firstOrNull()
        ?: autoMappedPaths?.firstOrNull()
        ?: draft?.finalMenuPaths?.firstOrNull()
        ?: ""

    val isUnmapped = suggestedTitle.isBlank() && decision != "AUTO_MAPPED"

    return QueueRowPresentation(
        imageUrl = image?.trim()?.takeIf { it.startsWith("http") },
        title = title,
        meta = meta,
        breadcrumb = breadcrumb,
        status = status,
        statusColor = color,
        suggestedTitle = suggestedTitle,
        isUnmapped = isUnmapped,
    )
}
