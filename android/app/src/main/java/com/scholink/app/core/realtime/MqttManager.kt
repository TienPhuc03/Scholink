package com.scholink.app.core.realtime

import android.content.Context
import android.util.Log
import org.eclipse.paho.client.mqttv3.*
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence

class MqttManager(context: Context) {
    private val TAG = "MqttManager"
    private val serverUri = "tcp://10.0.2.2:1883"
    private val clientId = "scholink_android_" + System.currentTimeMillis()
    private var mqttClient: MqttAsyncClient? = null

    fun connect(userId: String, onMessageReceived: (topic: String, message: String) -> Unit) {
        try {
            mqttClient = MqttAsyncClient(serverUri, clientId, MemoryPersistence())
            val options = MqttConnectOptions().apply {
                isCleanSession = true
                connectionTimeout = 10
                keepAliveInterval = 20
            }

            mqttClient?.connect(options, null, object : IMqttActionListener {
                override fun onSuccess(asyncActionToken: IMqttToken?) {
                    Log.d(TAG, "Connected to MQTT Broker")
                    subscribeToTopics(userId)
                }

                override fun onFailure(asyncActionToken: IMqttToken?, exception: Throwable?) {
                    Log.e(TAG, "Failed to connect to MQTT: ${exception?.message}")
                }
            })

            mqttClient?.setCallback(object : MqttCallback {
                override fun connectionLost(cause: Throwable?) {
                    Log.w(TAG, "MQTT Connection lost")
                }

                override fun messageArrived(topic: String?, message: MqttMessage?) {
                    val payload = message?.payload?.let { String(it) } ?: ""
                    topic?.let { onMessageReceived(it, payload) }
                }

                override fun deliveryComplete(token: IMqttDeliveryToken?) {}
            })
        } catch (e: Exception) {
            Log.e(TAG, "Error initializing MQTT: ${e.message}")
        }
    }

    private fun subscribeToTopics(userId: String) {
        try {
            // Subscribe to private notifications & chat topics
            mqttClient?.subscribe("users/$userId/notifications", 1)
            mqttClient?.subscribe("users/$userId/chat", 1)
        } catch (e: Exception) {
            Log.e(TAG, "Error subscribing to topics: ${e.message}")
        }
    }

    fun disconnect() {
        try {
            mqttClient?.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "Error disconnecting MQTT: ${e.message}")
        }
    }
}
