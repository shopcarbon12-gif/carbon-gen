package com.shopcarbon.collectionmapping

import android.app.Application

class ShopCarbonApplication : Application() {
    val preferences by lazy { ShopCarbonPreferences(this) }
}
