package com.scholink.app.core.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.scholink.app.core.database.dao.OpportunityDao
import com.scholink.app.core.database.entity.OpportunityEntity

@Database(entities = [OpportunityEntity::class], version = 1, exportSchema = false)
abstract class ScholinkDatabase : RoomDatabase() {
    abstract fun opportunityDao(): OpportunityDao

    companion object {
        @Volatile
        private var INSTANCE: ScholinkDatabase? = null

        fun getDatabase(context: Context): ScholinkDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    ScholinkDatabase::class.java,
                    "scholink_offline.db"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
