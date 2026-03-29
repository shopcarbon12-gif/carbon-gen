package com.shopcarbon.collectionmapping.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.FolderOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material.icons.outlined.AddLink
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shopcarbon.collectionmapping.data.MappingProductRow
import com.shopcarbon.collectionmapping.ui.components.CoilImage
import com.shopcarbon.collectionmapping.ui.mapping.MappingViewModel
import com.shopcarbon.collectionmapping.ui.mapping.toPresentation

@Composable
fun MappingScreen(
    viewModel: MappingViewModel,
    modifier: Modifier = Modifier,
    bottomInsetDp: Dp = 0.dp,
) {
    val state by viewModel.ui.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        viewModel.load()
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(bottom = bottomInsetDp),
    ) {
        Spacer(Modifier.height(8.dp))
        StatusChipsRow(
            total = state.total,
            rows = state.rows,
        )
        Spacer(Modifier.height(16.dp))

        if (state.error != null) {
            Text(
                state.error!!,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }
        if (state.warning != null) {
            Text(
                state.warning!!,
                color = Color(0xFFFFB95F),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }
        if (state.loading) {
            Text("Loading…", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }
        state.shop?.let { shop ->
            Text(
                "Shop: $shop",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0xFF030E22))
                .padding(start = 4.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Search, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(8.dp))
                BasicTextField(
                    value = state.search,
                    onValueChange = viewModel::setSearch,
                    textStyle = TextStyle(color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp, bottom = 12.dp, end = 12.dp),
                    decorationBox = { inner ->
                        Box {
                            if (state.search.isEmpty()) {
                                Text(
                                    "Search products (matches web `q`)…",
                                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f),
                                    fontSize = 15.sp,
                                )
                            }
                            inner()
                        }
                    },
                )
            }
        }

        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                IconChip(Icons.Default.UnfoldMore)
                IconChip(Icons.Default.Refresh, onClick = { viewModel.load(refreshRemote = true) })
                IconChip(Icons.AutoMirrored.Filled.Undo)
            }
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF4D8EFF))
                    .clickable(enabled = !state.saving) { viewModel.saveDraftsForCurrentPage() }
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Default.Save, contentDescription = null, tint = Color(0xFF00285D), modifier = Modifier.size(18.dp))
                Text(
                    if (state.saving) "SAVING…" else "SAVE DRAFT",
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 13.sp),
                    color = Color(0xFF00285D),
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }

        Spacer(Modifier.height(16.dp))
        AccordionRow(Icons.AutoMirrored.Filled.MenuBook, "Menu Items")
        Spacer(Modifier.height(10.dp))
        AccordionRow(
            Icons.Default.FolderOff,
            "Unmapped Collections (${state.rows.count { it.toPresentation().isUnmapped }})",
        )

        Spacer(Modifier.height(20.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(
                "COLLECTION MAPPING QUEUE",
                style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.5.sp),
                color = MaterialTheme.colorScheme.outline,
                fontWeight = FontWeight.Black,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("SELECT ALL", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                val rowIds = state.rows.mapNotNull { it.id?.trim()?.takeIf { id -> id.isNotEmpty() } }
                val allSelected = rowIds.isNotEmpty() && rowIds.all { it in state.reviewedRowIds }
                Checkbox(
                    checked = allSelected,
                    onCheckedChange = { viewModel.setAllReviewedOnPage(it) },
                    modifier = Modifier.size(36.dp),
                )
            }
        }

        Spacer(Modifier.height(12.dp))
        if (state.rows.isEmpty() && !state.loading && state.error == null) {
            Text(
                "No rows on this page. Adjust search or pull to refresh on server.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        state.rows.forEach { row ->
            val p = row.toPresentation()
            Spacer(Modifier.height(12.dp))
            val rowId = row.id?.trim()?.takeIf { it.isNotEmpty() }
            val reviewed = rowId != null && rowId in state.reviewedRowIds
            if (p.isUnmapped) {
                QueueCardUnmapped(
                    rowId = rowId,
                    reviewed = reviewed,
                    onReviewedChange = { want -> rowId?.let { viewModel.setRowReviewed(it, want) } },
                    imageUrl = p.imageUrl,
                    title = p.title,
                    meta = p.meta,
                    breadcrumb = p.breadcrumb,
                )
            } else {
                QueueCard(
                    rowId = rowId,
                    reviewed = reviewed,
                    onReviewedChange = { want -> rowId?.let { viewModel.setRowReviewed(it, want) } },
                    borderColor = p.statusColor,
                    imageUrl = p.imageUrl,
                    status = p.status,
                    statusColor = p.statusColor,
                    title = p.title,
                    meta = p.meta,
                    breadcrumb = p.breadcrumb,
                    suggestedTitle = p.suggestedTitle.ifBlank { "—" },
                )
            }
        }
        Spacer(Modifier.height(120.dp))
    }
}

@Composable
fun MappingBottomCommitBar(onCommitClick: () -> Unit = {}) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Brush.horizontalGradient(listOf(Color(0xFFADC6FF), Color(0xFF4D8EFF))))
            .clickable(onClick = onCommitClick)
            .padding(vertical = 18.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "COMMIT CHANGES",
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 13.sp, letterSpacing = 2.sp),
            color = Color(0xFF002E6A),
            fontWeight = FontWeight.Black,
        )
        Icon(
            Icons.Default.RocketLaunch,
            contentDescription = null,
            tint = Color(0xFF002E6A),
            modifier = Modifier.padding(start = 10.dp),
        )
    }
}

private fun rowDecision(row: MappingProductRow) =
    row.draft?.mappingDecision ?: row.mappingDecision

@Composable
private fun StatusChipsRow(total: Int, rows: List<MappingProductRow>) {
    val scroll = rememberScrollState()
    val review = rows.count { rowDecision(it) == "MANUAL_REVIEW" }
    val suggested = rows.count { rowDecision(it) == "SUGGESTED" }
    val auto = rows.count { rowDecision(it) == "AUTO_MAPPED" }
    val other = rows.count { rowDecision(it).isNullOrBlank() || (rowDecision(it) !in setOf("MANUAL_REVIEW", "SUGGESTED", "AUTO_MAPPED")) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(scroll),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        StatusChip("TOTAL ($total)", Color(0xFFADC6FF))
        StatusChip("NEEDS REVIEW ($review)", Color(0xFFFFB95F))
        StatusChip("SUGGESTED ($suggested)", Color(0xFF818CF8))
        StatusChip("AUTO ($auto)", Color(0xFF4AE176))
        StatusChip("OTHER ($other)", MaterialTheme.colorScheme.outline)
    }
}

@Composable
private fun StatusChip(label: String, dot: Color) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(dot.copy(alpha = 0.1f))
            .border(1.dp, dot.copy(alpha = 0.2f), RoundedCornerShape(999.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(dot),
        )
        Text(
            label,
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
            color = dot,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = 6.dp),
        )
    }
}

@Composable
private fun IconChip(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit = {},
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xFF151F35))
            .clickable(onClick = onClick)
            .padding(12.dp),
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun AccordionRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFF151F35))
            .clickable { }
            .padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.outline)
            Text(label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 12.dp))
        }
        Icon(Icons.Default.ExpandMore, contentDescription = null, tint = MaterialTheme.colorScheme.outline)
    }
}

@Composable
private fun QueueCard(
    rowId: String?,
    reviewed: Boolean,
    onReviewedChange: (Boolean) -> Unit,
    borderColor: Color,
    imageUrl: String?,
    status: String,
    statusColor: Color,
    title: String,
    meta: String,
    breadcrumb: String,
    suggestedTitle: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFF151F35))
            .border(1.dp, borderColor.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (rowId != null) {
            Checkbox(
                checked = reviewed,
                onCheckedChange = onReviewedChange,
                modifier = Modifier.padding(end = 8.dp),
            )
        } else {
            Spacer(Modifier.size(48.dp))
        }
        if (imageUrl.isNullOrBlank()) {
            Box(
                Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF030E22)),
            )
        } else {
            CoilImage(
                url = imageUrl,
                contentDescription = null,
                modifier = Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color.Black.copy(alpha = 0.2f)),
            )
        }
        Column(Modifier.weight(1f).padding(start = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(statusColor),
                )
                Text(
                    status,
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                    color = statusColor,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 4.dp))
            Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline, fontSize = 11.sp)
            Text(breadcrumb, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))

            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF030E22))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text("SUGGESTED MAPPING", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline, fontSize = 9.sp)
                    Text(suggestedTitle, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                }
                Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = Color(0xFFADC6FF), modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Composable
private fun QueueCardUnmapped(
    rowId: String?,
    reviewed: Boolean,
    onReviewedChange: (Boolean) -> Unit,
    imageUrl: String?,
    title: String,
    meta: String,
    breadcrumb: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFF151F35))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (rowId != null) {
            Checkbox(
                checked = reviewed,
                onCheckedChange = onReviewedChange,
                modifier = Modifier.padding(end = 8.dp),
            )
        } else {
            Spacer(Modifier.size(48.dp))
        }
        if (imageUrl.isNullOrBlank()) {
            Box(
                Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF030E22)),
            )
        } else {
            CoilImage(
                url = imageUrl,
                contentDescription = null,
                modifier = Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color.Black.copy(alpha = 0.2f)),
            )
        }
        Column(Modifier.weight(1f).padding(start = 16.dp)) {
            Text("UNMAPPED", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = MaterialTheme.colorScheme.outline, fontWeight = FontWeight.Bold)
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 4.dp))
            Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline, fontSize = 11.sp)
            Text(breadcrumb, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))

            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
                    .clickable { }
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Icon(Icons.Outlined.AddLink, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                Text(
                    "MAP COLLECTION",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
    }
}
