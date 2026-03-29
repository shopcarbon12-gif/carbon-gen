package com.shopcarbon.collectionmapping.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val ShopCarbonDarkColors = darkColorScheme(
    primary = Color(0xFFADC6FF),
    onPrimary = Color(0xFF002E6A),
    primaryContainer = Color(0xFF4D8EFF),
    onPrimaryContainer = Color(0xFF00285D),
    secondary = Color(0xFF4AE176),
    onSecondary = Color(0xFF003915),
    tertiary = Color(0xFFFFB95F),
    background = Color(0xFF081328),
    surface = Color(0xFF081328),
    surfaceVariant = Color(0xFF2A354B),
    onSurface = Color(0xFFD8E2FF),
    onSurfaceVariant = Color(0xFFC2C6D6),
    outline = Color(0xFF8C909F),
    outlineVariant = Color(0xFF424754),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
)

@Composable
fun CollectionMappingTheme(content: @Composable () -> Unit) {
    val colorScheme = ShopCarbonDarkColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            window.navigationBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content,
    )
}
