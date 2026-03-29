package com.shopcarbon.collectionmapping.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.FactCheck
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Password
import androidx.compose.material.icons.filled.SyncAlt
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shopcarbon.collectionmapping.RemoteImages
import com.shopcarbon.collectionmapping.ShopCarbonApplication
import com.shopcarbon.collectionmapping.ui.components.CoilAvatar
import com.shopcarbon.collectionmapping.ui.theme.SurfaceContainer
import com.shopcarbon.collectionmapping.ui.theme.SurfaceContainerHigh
import com.shopcarbon.collectionmapping.ui.theme.SurfaceContainerLow

@Composable
fun SettingsScreen(
    modifier: Modifier = Modifier,
    onApiConfigSaved: () -> Unit = {},
) {
    val context = LocalContext.current
    val prefs = remember { (context.applicationContext as ShopCarbonApplication).preferences }
    var apiUrl by remember { mutableStateOf("") }
    var shop by remember { mutableStateOf("") }
    var cookie by remember { mutableStateOf("") }
    var showSignInDialog by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        apiUrl = prefs.apiBaseUrl
        shop = prefs.shopDomain
        cookie = prefs.sessionCookie
    }

    val signInBase = apiUrl.trim().trimEnd('/').ifEmpty { prefs.apiBaseUrl.trim().trimEnd('/') }
    val canSignIn = signInBase.isNotBlank() &&
        !signInBase.contains("INVALID_CONFIGURE", ignoreCase = true)

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(bottom = 100.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(SurfaceContainerHigh)
                .padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box {
                CoilAvatar(RemoteImages.settingsAvatar, Modifier.size(80.dp))
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(18.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF4AE176)),
                )
            }
            Column(Modifier.padding(start = 20.dp)) {
                Text(
                    "Signed-in user",
                    style = MaterialTheme.typography.headlineMedium.copy(fontSize = 22.sp),
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    "ShopCarbon • you@example.com",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "PRO PLAN",
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp, letterSpacing = 2.sp),
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }

        Spacer(Modifier.height(28.dp))

        SettingsSection("API") {
            SettingsCard {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        "Set your API origin below. To attach your login session to API calls, use \"Sign in in WebView\" (recommended) or paste the Cookie header value manually.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = apiUrl,
                        onValueChange = { apiUrl = it },
                        label = { Text("API base URL") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = shop,
                        onValueChange = { shop = it },
                        label = { Text("Shop domain (optional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = cookie,
                        onValueChange = { cookie = it },
                        label = { Text("Session cookie (optional)") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = { showSignInDialog = true },
                        enabled = canSignIn,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Sign in in WebView (save session)")
                    }
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = {
                            prefs.apiBaseUrl = apiUrl.trim().trimEnd('/')
                            prefs.shopDomain = shop.trim()
                            prefs.sessionCookie = cookie.trim()
                            onApiConfigSaved()
                            Toast.makeText(context, "API settings saved", Toast.LENGTH_SHORT).show()
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Save API settings")
                    }
                }
            }
        }

        if (showSignInDialog && canSignIn) {
            ShopCarbonSessionWebViewDialog(
                apiBaseUrl = signInBase,
                onDismiss = { showSignInDialog = false },
                onCookiesCaptured = { raw ->
                    prefs.sessionCookie = raw.trim()
                    cookie = raw.trim()
                    onApiConfigSaved()
                    Toast.makeText(context, "Session cookie saved", Toast.LENGTH_SHORT).show()
                    showSignInDialog = false
                },
            )
        }

        Spacer(Modifier.height(24.dp))

        SettingsSection("ACCOUNT") {
            SettingsCard {
                SettingsRow(
                    icon = { Icon(Icons.Default.Mail, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                    title = "Email Address",
                    subtitle = "you@example.com",
                    showChevron = true,
                )
                SettingsRow(
                    icon = { Icon(Icons.Default.WorkspacePremium, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                    title = "Subscription Plan",
                    subtitle = "Manage billing and tiers",
                    showChevron = true,
                    alternateBg = true,
                )
            }
        }

        Spacer(Modifier.height(24.dp))

        SettingsSection("SYNC PREFERENCES") {
            SettingsCard {
                SettingsToggleRow(
                    icon = { Icon(Icons.Default.SyncAlt, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                    title = "Auto-sync Cloud Data",
                    on = true,
                )
                SettingsRow(
                    icon = { Icon(Icons.Default.FactCheck, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                    title = "Manual Review Mode",
                    subtitle = null,
                    showChevron = true,
                    alternateBg = true,
                )
            }
        }

        Spacer(Modifier.height(24.dp))

        SettingsSection("NOTIFICATIONS") {
            SettingsCard {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { }
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.NotificationsActive, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            "Push Notifications",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(start = 16.dp),
                        )
                    }
                    Text(
                        "ENABLED",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold,
                    )
                }
                SettingsRow(
                    icon = { Icon(Icons.Default.AlternateEmail, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                    title = "Email Digests",
                    subtitle = null,
                    showChevron = true,
                    alternateBg = true,
                )
            }
        }

        Spacer(Modifier.height(24.dp))

        SettingsSection("SECURITY") {
            SettingsCard {
                SettingsToggleRow(
                    icon = { Icon(Icons.Default.Fingerprint, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                    title = "Biometric Authentication",
                    on = false,
                )
                SettingsRow(
                    icon = { Icon(Icons.Default.Password, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                    title = "Change Access Key",
                    subtitle = null,
                    showChevron = true,
                    alternateBg = true,
                )
            }
        }

        Spacer(Modifier.height(24.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(SurfaceVariant)
                .clickable { },
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.Logout, null, tint = MaterialTheme.colorScheme.error)
            Text(
                "LOG OUT",
                style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 2.sp),
                color = MaterialTheme.colorScheme.error,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 12.dp),
            )
        }
    }
}

@Composable
private fun SettingsSection(title: String, content: @Composable () -> Unit) {
    Text(
        title,
        style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 2.sp),
        color = MaterialTheme.colorScheme.primary,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(start = 8.dp, bottom = 12.dp),
    )
    content()
}

@Composable
private fun SettingsCard(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(SurfaceContainer),
    ) {
        content()
    }
}

@Composable
private fun SettingsRow(
    icon: @Composable () -> Unit,
    title: String,
    subtitle: String?,
    showChevron: Boolean,
    alternateBg: Boolean = false,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (alternateBg) SurfaceContainerLow else Color.Transparent)
            .clickable { }
            .padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
            icon()
            Column(Modifier.padding(start = 16.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                if (subtitle != null) {
                    Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (showChevron) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowForwardIos,
                null,
                tint = MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun SettingsToggleRow(
    icon: @Composable () -> Unit,
    title: String,
    on: Boolean,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { }
            .padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            icon()
            Text(
                title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 16.dp),
            )
        }
        val track = if (on) MaterialTheme.colorScheme.primary else SurfaceVariant
        val knob = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.outlineVariant
        Box(
            modifier = Modifier
                .size(width = 40.dp, height = 24.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(track),
        ) {
            Box(
                modifier = Modifier
                    .align(if (on) Alignment.CenterEnd else Alignment.CenterStart)
                    .padding(4.dp)
                    .size(16.dp)
                    .clip(CircleShape)
                    .background(knob),
            )
        }
    }
}

private val SurfaceVariant = Color(0xFF2A354B)
