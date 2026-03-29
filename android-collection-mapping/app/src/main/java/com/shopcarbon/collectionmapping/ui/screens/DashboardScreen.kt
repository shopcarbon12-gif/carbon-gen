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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Hub
import androidx.compose.material.icons.filled.Pending
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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
fun DashboardScreen(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(bottom = 100.dp),
    ) {
        Text(
            text = "PERFORMANCE",
            style = MaterialTheme.typography.headlineMedium.copy(
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = (-0.5).sp,
            ),
            color = MaterialTheme.colorScheme.onBackground,
        )
        Text(
            text = "Real-time mapping intelligence",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp, bottom = 24.dp),
        )

        SyncProgressCard()

        Spacer(modifier = Modifier.height(24.dp))

        GlobalReachBento()

        Spacer(modifier = Modifier.height(16.dp))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            StatMiniCard(
                modifier = Modifier.weight(1f),
                icon = {
                    Icon(
                        Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = Color(0xFF4AE176),
                        modifier = Modifier.size(28.dp),
                    )
                },
                label = "MAPPED",
                value = "12.8k",
                valueColor = Color(0xFF4AE176),
            )
            StatMiniCard(
                modifier = Modifier.weight(1f),
                icon = {
                    Icon(
                        Icons.Default.Pending,
                        contentDescription = null,
                        tint = Color(0xFFFFB95F),
                        modifier = Modifier.size(28.dp),
                    )
                },
                label = "PENDING",
                value = "842",
                valueColor = Color(0xFFFFB95F),
            )
        }

        Spacer(modifier = Modifier.height(28.dp))

        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom,
        ) {
            Text(
                "RECENT ACTIVITY",
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
        ActivityRow(
            RemoteImages.dashboardActivity1,
            "Sector 7-G Urban",
            "2 MINS AGO",
            "SYNCED",
            Color(0xFF4AE176),
        )
        Spacer(Modifier.height(12.dp))
        ActivityRow(
            RemoteImages.dashboardActivity2,
            "North Ridge Trail",
            "14 MINS AGO",
            "REVIEW",
            Color(0xFFFFB95F),
        )
        Spacer(Modifier.height(12.dp))
        ActivityRow(
            RemoteImages.dashboardActivity3,
            "Port Terminal B",
            "1 HOUR AGO",
            "SYNCED",
            Color(0xFF4AE176),
        )
    }
}

@Composable
private fun SyncProgressCard() {
    val track = Color(0xFF2A354B)
    val ringPrimary = Color(0xFFADC6FF)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(SurfaceContainer)
            .padding(24.dp),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(192.dp)) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val stroke = 12.dp.toPx()
                    val r = size.minDimension / 2 - stroke
                    val topLeft = Offset(center.x - r, center.y - r)
                    val arcSize = Size(r * 2, r * 2)
                    drawArc(
                        color = track,
                        startAngle = -90f,
                        sweepAngle = 360f,
                        useCenter = false,
                        style = Stroke(width = stroke, cap = StrokeCap.Round),
                        topLeft = topLeft,
                        size = arcSize,
                    )
                    drawArc(
                        color = ringPrimary,
                        startAngle = -90f,
                        sweepAngle = 360f * 0.75f,
                        useCenter = false,
                        style = Stroke(width = stroke, cap = StrokeCap.Round),
                        topLeft = topLeft,
                        size = arcSize,
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "75%",
                        style = MaterialTheme.typography.displayLarge.copy(fontSize = 40.sp),
                        color = ringPrimary,
                    )
                    Text(
                        "SYNC PROGRESS",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("UPLOADED", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("1.2k", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.width(24.dp))
                Box(Modifier.width(1.dp).height(32.dp).background(Color(0x33424754)))
                Spacer(Modifier.width(24.dp))
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("REMAINING", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("402", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun GlobalReachBento() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(140.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(Color(0xFFADC6FF), Color(0xFF4D8EFF)),
                ),
            )
            .padding(20.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.White.copy(alpha = 0.2f))
                    .padding(8.dp),
            ) {
                Icon(Icons.Default.Hub, contentDescription = null, tint = Color(0xFF002E6A))
            }
            Text(
                "GLOBAL REACH",
                style = MaterialTheme.typography.labelSmall,
                color = Color(0xFF002E6A).copy(alpha = 0.7f),
            )
        }
        Column(Modifier.align(Alignment.BottomStart)) {
            Text(
                "Total Collections",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF002E6A).copy(alpha = 0.85f),
            )
            Text(
                "18,492",
                style = MaterialTheme.typography.displayLarge.copy(fontSize = 36.sp),
                color = Color(0xFF002E6A),
            )
        }
    }
}

@Composable
private fun StatMiniCard(
    modifier: Modifier = Modifier,
    icon: @Composable () -> Unit,
    label: String,
    value: String,
    valueColor: Color,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(24.dp))
            .background(SurfaceContainerHigh)
            .padding(20.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        icon()
        Spacer(Modifier.height(12.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            value,
            style = MaterialTheme.typography.headlineMedium.copy(fontSize = 24.sp),
            color = valueColor,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun ActivityRow(
    imageUrl: String,
    title: String,
    time: String,
    badge: String,
    badgeColor: Color,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(SurfaceContainerLow)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CoilImage(
                url = imageUrl,
                contentDescription = null,
                modifier = Modifier.size(48.dp),
            )
            Column(Modifier.padding(start = 16.dp)) {
                Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                Text(
                    time,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(badgeColor.copy(alpha = 0.12f))
                .padding(horizontal = 10.dp, vertical = 6.dp),
        ) {
            Box(
                Modifier
                    .size(6.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(badgeColor),
            )
            Text(
                badge,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                color = badgeColor,
                modifier = Modifier.padding(start = 6.dp),
            )
        }
    }
}
