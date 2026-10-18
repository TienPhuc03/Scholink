package com.scholink.app

import android.app.Application
import com.scholink.app.core.database.ScholinkDatabase
import com.scholink.app.core.datastore.SecureTokenStorage
import com.scholink.app.core.network.RetrofitClient
import com.scholink.app.core.realtime.MqttManager

class ScholinkApplication : Application() {

    lateinit var database: ScholinkDatabase
        private set

    lateinit var tokenStorage: SecureTokenStorage
        private set

    lateinit var mqttManager: MqttManager
        private set

    override fun onCreate() {
        super.onCreate()
        database = ScholinkDatabase.getDatabase(this)
        tokenStorage = SecureTokenStorage(this)
        mqttManager = MqttManager(this)
        RetrofitClient.getInstance(this)
    }
}
