package com.scholink.app.core.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightColorScheme = lightColorScheme(
    primary = ScholinkBlue,
    secondary = ScholinkGreen,
    background = ScholinkBackground,
    surface = ScholinkSurface,
    error = ScholinkError,
    onPrimary = ScholinkSurface,
    onSecondary = ScholinkSurface,
    onBackground = TextPrimary,
    onSurface = TextPrimary
)

@Composable
fun ScholinkTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        content = content
    )
}
