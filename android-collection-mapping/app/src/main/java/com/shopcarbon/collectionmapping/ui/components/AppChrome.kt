package com.shopcarbon.collectionmapping.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shopcarbon.collectionmapping.NavDest

@Composable
fun AppTopBar(
    title: String,
    modifier: Modifier = Modifier,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(56.dp)
            .background(Color(0xF20C1528))
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Default.Menu,
                contentDescription = null,
                tint = Color(0xFF3B82F6),
                modifier = Modifier.size(24.dp),
            )
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Black,
                    color = Color(0xFF3B82F6),
                    letterSpacing = (-0.5).sp,
                ),
                modifier = Modifier.padding(start = 12.dp),
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically, content = trailing)
    }
}

/** Top bar for Dashboard / Analytics / Settings — ShopCarbon product, not the Stitch “Obsidian” mock label. */
@Composable
fun ShopCarbonTopBar(trailing: @Composable RowScope.() -> Unit = {}) {
    AppTopBar(
        title = "ShopCarbon",
        trailing = {
            Icon(
                Icons.Default.Sync,
                contentDescription = null,
                tint = Color(0xFF3B82F6),
                modifier = Modifier.size(24.dp),
            )
        },
    )
}

@Composable
fun CarbonMappingTopBar(
    onSync: () -> Unit,
    avatarUrl: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Default.Menu,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = "ShopCarbon",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .clickable(onClick = onSync),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Default.Sync,
                    contentDescription = "Sync",
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
            CoilAvatar(
                url = avatarUrl,
                modifier = Modifier
                    .padding(start = 8.dp)
                    .size(32.dp),
            )
        }
    }
}

data class BottomItem(
    val dest: NavDest,
    val label: String,
    val icon: ImageVector,
)

@Composable
fun AppBottomNav(
    items: List<BottomItem>,
    selected: NavDest,
    onSelect: (NavDest) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Color(0xF20C1528))
            .padding(vertical = 8.dp, horizontal = 8.dp),
        horizontalArrangement = Arrangement.SpaceAround,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEach { item ->
            val active = item.dest == selected
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .clickable { onSelect(item.dest) }
                    .then(
                        if (active) {
                            Modifier
                                .background(Color(0x1A3B82F6), RoundedCornerShape(12.dp))
                                .padding(horizontal = 12.dp, vertical = 6.dp)
                        } else {
                            Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                        },
                    ),
            ) {
                Icon(
                    item.icon,
                    contentDescription = item.label,
                    tint = if (active) Color(0xFF60A5FA) else Color(0xFF64748B),
                )
                Text(
                    text = item.label.uppercase(),
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 8.sp),
                    color = if (active) Color(0xFF60A5FA) else Color(0xFF64748B),
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}
