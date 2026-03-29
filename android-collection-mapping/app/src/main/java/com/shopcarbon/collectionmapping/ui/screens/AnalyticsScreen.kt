package com.shopcarbon.collectionmapping.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shopcarbon.collectionmapping.RemoteImages
import com.shopcarbon.collectionmapping.ui.components.CoilImage
import com.shopcarbon.collectionmapping.ui.theme.SurfaceContainer
import com.shopcarbon.collectionmapping.ui.theme.SurfaceContainerHigh
import com.shopcarbon.collectionmapping.ui.theme.SurfaceContainerLow

@Composable
fun AnalyticsScreen(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(bottom = 100.dp),
    ) {
        Text(
            "PERFORMANCE OVERVIEW",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.primary,
        )
        Text(
            "Analytics",
            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Black),
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(top = 4.dp, bottom = 20.dp),
        )

        MappingAccuracyCard()

        Spacer(Modifier.height(16.dp))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Column(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(SurfaceContainerHigh)
                    .padding(16.dp),
            ) {
                Text("TOTAL NODES", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                Text(
                    "12,482",
                    style = MaterialTheme.typography.headlineMedium.copy(fontSize = 26.sp),
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Black,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            Column(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(SurfaceContainerHigh)
                    .padding(16.dp),
            ) {
                Text("EFFICIENCY", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                Text(
                    "+14.2%",
                    style = MaterialTheme.typography.headlineMedium.copy(fontSize = 26.sp),
                    color = Color(0xFF4AE176),
                    fontWeight = FontWeight.Black,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }

        Spacer(Modifier.height(20.dp))

        CollectionsProcessedBars()

        Spacer(Modifier.height(24.dp))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Top Collections by SKU",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                "VIEW ALL",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        Spacer(Modifier.height(12.dp))
        SkuRow(RemoteImages.analyticsArctic, "Arctic Horizon", "SKU-2930-B", "2.4k", "IN STOCK", Color(0xFF4AE176))
        Spacer(Modifier.height(12.dp))
        SkuRow(RemoteImages.analyticsCarbon, "Carbon Core", "SKU-8812-C", "1.9k", "LOW SUPPLY", Color(0xFFFFB95F))
        Spacer(Modifier.height(12.dp))
        SkuRow(RemoteImages.analyticsMidnight, "Midnight Flux", "SKU-4401-X", "1.2k", "IN STOCK", Color(0xFF4AE176))
    }
}

@Composable
private fun MappingAccuracyCard() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(SurfaceContainer)
            .padding(20.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text("Mapping Accuracy", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(
                    "Last 30 days avg.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(Color(0xFF4AE176).copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                Text("98.4%", style = MaterialTheme.typography.labelSmall, color = Color(0xFF4AE176))
            }
        }
        Spacer(Modifier.height(16.dp))
        Box(Modifier.fillMaxWidth().height(128.dp)) {
            val line = Color(0xFFADC6FF)
            Canvas(Modifier.fillMaxSize()) {
                val w = size.width
                val h = size.height
                val path = Path().apply {
                    moveTo(0f, h * 0.88f)
                    quadraticBezierTo(w * 0.2f, h * 0.78f, w * 0.35f, h * 0.62f)
                    quadraticBezierTo(w * 0.5f, h * 0.7f, w * 0.65f, h * 0.38f)
                    quadraticBezierTo(w * 0.8f, h * 0.45f, w, h * 0.25f)
                }
                drawPath(
                    path,
                    color = line,
                    style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round),
                )
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("OCT 01", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
            Text("OCT 15", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
            Text("TODAY", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
        }
    }
}

@Composable
private fun CollectionsProcessedBars() {
    val heights = listOf(0.4f, 0.6f, 0.35f, 0.8f, 0.55f, 0.95f, 0.7f)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(SurfaceContainer)
            .padding(20.dp),
    ) {
        Text("Collections Processed", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(20.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .height(160.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            heights.forEachIndexed { index, frac ->
                val highlight = index == 6
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .height((160 * frac).dp)
                        .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                        .background(
                            if (highlight) Color(0xFFADC6FF) else Color(0xFFADC6FF).copy(alpha = 0.2f),
                        ),
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            listOf("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN").forEach { d ->
                Text(d, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
            }
        }
    }
}

@Composable
private fun SkuRow(
    url: String,
    title: String,
    sku: String,
    count: String,
    status: String,
    statusColor: Color,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(SurfaceContainerLow)
            .padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CoilImage(url, null, Modifier.size(48.dp))
            Column(Modifier.padding(start = 16.dp)) {
                Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                Text(sku, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(count, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
            Text(
                status,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                color = statusColor,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
