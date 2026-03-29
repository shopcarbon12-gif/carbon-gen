package com.shopcarbon.collectionmapping

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.shopcarbon.collectionmapping.ui.components.AppBottomNav
import com.shopcarbon.collectionmapping.ui.components.BottomItem
import com.shopcarbon.collectionmapping.ui.components.CarbonMappingTopBar
import com.shopcarbon.collectionmapping.ui.components.ShopCarbonTopBar
import com.shopcarbon.collectionmapping.ui.screens.AnalyticsScreen
import com.shopcarbon.collectionmapping.ui.screens.DashboardScreen
import com.shopcarbon.collectionmapping.data.CollectionMappingRepository
import com.shopcarbon.collectionmapping.ui.mapping.MappingViewModel
import com.shopcarbon.collectionmapping.ui.mapping.MappingViewModelFactory
import com.shopcarbon.collectionmapping.ui.screens.MappingBottomCommitBar
import com.shopcarbon.collectionmapping.ui.screens.MappingScreen
import com.shopcarbon.collectionmapping.ui.screens.SettingsScreen
import com.shopcarbon.collectionmapping.ui.theme.CollectionMappingTheme

class MainActivity : ComponentActivity() {

    private val appPrefs by lazy { (application as ShopCarbonApplication).preferences }

    private val mappingRepository by lazy { CollectionMappingRepository(appPrefs) }

    private val mappingViewModel: MappingViewModel by viewModels {
        MappingViewModelFactory(application, mappingRepository)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CollectionMappingTheme {
                var tab by remember { mutableStateOf(NavDest.Mapping) }
                val bottomItems = listOf(
                    BottomItem(NavDest.Dashboard, "Dashboard", Icons.Default.Dashboard),
                    BottomItem(NavDest.Mapping, "Mapping", Icons.Default.Explore),
                    BottomItem(NavDest.Analytics, "Analytics", Icons.Default.Insights),
                    BottomItem(NavDest.Settings, "Settings", Icons.Default.Settings),
                )
                Scaffold(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFF081328)),
                    contentWindowInsets = WindowInsets(0),
                    topBar = {
                        Column(Modifier.statusBarsPadding()) {
                            when (tab) {
                                NavDest.Mapping -> CarbonMappingTopBar(
                                    onSync = { mappingViewModel.load(refreshRemote = true) },
                                    avatarUrl = RemoteImages.mappingAvatar,
                                )
                                else -> ShopCarbonTopBar()
                            }
                        }
                    },
                    bottomBar = {
                        Column(
                            Modifier
                                .fillMaxWidth()
                                .navigationBarsPadding()
                                .background(Color(0xF20C1528)),
                        ) {
                            if (tab == NavDest.Mapping) {
                                MappingBottomCommitBar(
                                    onCommitClick = {
                                        val base = appPrefs.apiBaseUrl.trim().trimEnd('/')
                                        if (base.contains("INVALID_CONFIGURE", ignoreCase = true)) {
                                            Toast.makeText(
                                                this@MainActivity,
                                                "Configure API base URL in Settings first.",
                                                Toast.LENGTH_SHORT,
                                            ).show()
                                            return@MappingBottomCommitBar
                                        }
                                        val url = "$base/studio/shopify-collection-mapping"
                                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                    },
                                )
                                Spacer(Modifier.padding(8.dp))
                            }
                            AppBottomNav(
                                items = bottomItems,
                                selected = tab,
                                onSelect = { tab = it },
                            )
                        }
                    },
                ) { inner ->
                    when (tab) {
                        NavDest.Dashboard -> DashboardScreen(
                            Modifier
                                .fillMaxSize()
                                .padding(inner),
                        )
                        NavDest.Mapping -> MappingScreen(
                            viewModel = mappingViewModel,
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(inner),
                            bottomInsetDp = 0.dp,
                        )
                        NavDest.Analytics -> AnalyticsScreen(
                            Modifier
                                .fillMaxSize()
                                .padding(inner),
                        )
                        NavDest.Settings -> SettingsScreen(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(inner),
                            onApiConfigSaved = { mappingViewModel.refreshConfigFromPreferences() },
                        )
                    }
                }
            }
        }
    }
}
