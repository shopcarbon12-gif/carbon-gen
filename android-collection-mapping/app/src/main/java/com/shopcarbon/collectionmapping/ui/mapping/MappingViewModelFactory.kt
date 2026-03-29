package com.shopcarbon.collectionmapping.ui.mapping

import android.app.Application
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.shopcarbon.collectionmapping.data.CollectionMappingRepository

class MappingViewModelFactory(
    private val application: Application,
    private val repository: CollectionMappingRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(MappingViewModel::class.java)) {
            return MappingViewModel(application, repository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
