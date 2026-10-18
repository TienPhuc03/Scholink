package com.scholink.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.scholink.app.core.network.RetrofitClient
import com.scholink.app.core.ui.theme.ScholinkTheme
import com.scholink.app.features.auth.data.AuthApi
import com.scholink.app.features.auth.ui.LoginScreen
import com.scholink.app.features.auth.ui.LoginViewModel
import com.scholink.app.features.opportunity.data.OpportunityApi
import com.scholink.app.features.opportunity.ui.OpportunityListScreen
import com.scholink.app.features.opportunity.ui.OpportunityListViewModel
import com.scholink.app.features.passport.data.PassportApi
import com.scholink.app.features.passport.ui.PassportScreen
import com.scholink.app.features.passport.ui.PassportViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val app = application as ScholinkApplication
        val retrofit = RetrofitClient.getInstance(this)

        val authApi = retrofit.create(AuthApi::class.java)
        val opportunityApi = retrofit.create(OpportunityApi::class.java)
        val passportApi = retrofit.create(PassportApi::class.java)

        val loginViewModel = LoginViewModel(authApi, app.tokenStorage)
        val opportunityViewModel = OpportunityListViewModel(opportunityApi, app.database.opportunityDao())
        val passportViewModel = PassportViewModel(passportApi)

        setContent {
            ScholinkTheme {
                var currentTab by remember { mutableIntStateOf(0) }
                val isLoggedIn = app.tokenStorage.getAccessToken() != null
                var showLogin by remember { mutableStateOf(!isLoggedIn) }

                if (showLogin) {
                    LoginScreen(
                        viewModel = loginViewModel,
                        onLoginSuccess = { showLogin = false },
                        onNavigateToRegister = { /* Navigate to register */ }
                    )
                } else {
                    Scaffold(
                        modifier = Modifier.fillMaxSize(),
                        bottomBar = {
                            NavigationBar {
                                NavigationBarItem(
                                    selected = currentTab == 0,
                                    onClick = { currentTab = 0 },
                                    icon = { Icon(Icons.Default.Search, contentDescription = "Cơ hội") },
                                    label = { Text("Cơ hội") }
                                )
                                NavigationBarItem(
                                    selected = currentTab == 1,
                                    onClick = { currentTab = 1 },
                                    icon = { Icon(Icons.Default.AccountCircle, contentDescription = "Passport") },
                                    label = { Text("Passport") }
                                )
                                NavigationBarItem(
                                    selected = currentTab == 2,
                                    onClick = { currentTab = 2 },
                                    icon = { Icon(Icons.Default.Group, contentDescription = "Đội thi") },
                                    label = { Text("Đội thi") }
                                )
                            }
                        }
                    ) { innerPadding ->
                        Surface(modifier = Modifier.padding(innerPadding)) {
                            when (currentTab) {
                                0 -> OpportunityListScreen(
                                    viewModel = opportunityViewModel,
                                    onOpportunityClick = { /* View detail */ }
                                )
                                1 -> PassportScreen(viewModel = passportViewModel)
                                2 -> OpportunityListScreen(
                                    viewModel = opportunityViewModel,
                                    onOpportunityClick = { /* View team */ }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
