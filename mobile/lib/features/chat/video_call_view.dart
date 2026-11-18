import 'dart:async';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

/// Video Call Screen with real device Camera access, audio controls,
/// camera switching (front/back), timer, and defensive fallback.
class VideoCallView extends StatefulWidget {
  final String roomName;
  final String? roomId;

  const VideoCallView({
    super.key,
    required this.roomName,
    this.roomId,
  });

  @override
  State<VideoCallView> createState() => _VideoCallViewState();
}

class _VideoCallViewState extends State<VideoCallView> {
  List<CameraDescription> _cameras = <CameraDescription>[];
  CameraController? _cameraController;
  int _selectedCameraIndex = 0;
  bool _isCameraInitialized = false;
  bool _isMuted = false;
  bool _isVideoEnabled = true;
  bool _isFrontCamera = true;
  String? _cameraErrorMessage;

  Timer? _callDurationTimer;
  int _callDurationSeconds = 0;

  @override
  void initState() {
    super.initState();
    _startCallTimer();
    _initializeCamera();
  }

  void _startCallTimer() {
    _callDurationTimer = Timer.periodic(const Duration(seconds: 1), (Timer t) {
      if (mounted) {
        setState(() {
          _callDurationSeconds++;
        });
      }
    });
  }

  String _formatDuration(int seconds) {
    final int minutes = seconds ~/ 60;
    final int remainingSeconds = seconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${remainingSeconds.toString().padLeft(2, '0')}';
  }

  Future<void> _initializeCamera() async {
    try {
      _cameras = await availableCameras();
      if (_cameras.isEmpty) {
        if (mounted) {
          setState(() {
            _cameraErrorMessage =
                'Không tìm thấy thiết bị máy ảnh trên thiết bị này.';
          });
        }
        return;
      }

      // Find front camera first by default for video calls
      int initialIndex = _cameras.indexWhere(
        (CameraDescription c) => c.lensDirection == CameraLensDirection.front,
      );
      if (initialIndex == -1) {
        initialIndex = 0;
      }

      _selectedCameraIndex = initialIndex;
      await _setupCameraController(_cameras[_selectedCameraIndex]);
    } catch (e) {
      if (mounted) {
        setState(() {
          _cameraErrorMessage = 'Không thể truy cập máy ảnh: $e';
        });
      }
    }
  }

  Future<void> _setupCameraController(CameraDescription camera) async {
    final CameraController controller = CameraController(
      camera,
      ResolutionPreset.medium,
      enableAudio: true,
    );

    try {
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }

      setState(() {
        _cameraController = controller;
        _isCameraInitialized = true;
        _isFrontCamera = camera.lensDirection == CameraLensDirection.front;
        _cameraErrorMessage = null;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _cameraErrorMessage = 'Lỗi khởi tạo máy ảnh: $e';
          _isCameraInitialized = false;
        });
      }
    }
  }

  Future<void> _toggleCamera() async {
    if (_cameras.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Thiết bị chỉ có 1 camera khả dụng.'),
          duration: Duration(seconds: 1),
        ),
      );
      return;
    }

    final int nextIndex = (_selectedCameraIndex + 1) % _cameras.length;
    _selectedCameraIndex = nextIndex;

    await _cameraController?.dispose();
    setState(() {
      _isCameraInitialized = false;
    });

    await _setupCameraController(_cameras[_selectedCameraIndex]);
  }

  void _toggleMute() {
    setState(() {
      _isMuted = !_isMuted;
    });
  }

  void _toggleVideo() {
    setState(() {
      _isVideoEnabled = !_isVideoEnabled;
    });
  }

  void _endCall() {
    Navigator.of(context).pop();
  }

  @override
  void dispose() {
    _callDurationTimer?.cancel();
    _cameraController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF111827),
      body: Stack(
        children: <Widget>[
          // 1. MAIN VIDEO FEED (Device Camera Preview or Fallback)
          Positioned.fill(
            child: _buildMainVideoFeed(),
          ),

          // 2. GRADIENT OVERLAYS
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: 140,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: <Color>[Color(0xCC000000), Color(0x00000000)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            height: 180,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: <Color>[Color(0x00000000), Color(0xDD000000)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ),

          // 3. TOP APP BAR & CALL HEADER
          SafeArea(
            child: Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: Row(
                children: <Widget>[
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        color: Colors.white),
                    onPressed: _endCall,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Text(
                          widget.roomName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: <Widget>[
                            Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                color: Color(0xFF10B981),
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              _formatDuration(_callDurationSeconds),
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text(
                                'HD Live',
                                style: TextStyle(
                                  color: Colors.white70,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  // Camera Flip button on Top Right
                  IconButton(
                    icon: const Icon(Icons.flip_camera_ios_rounded,
                        color: Colors.white),
                    tooltip: 'Lật Camera',
                    onPressed: _toggleCamera,
                  ),
                ],
              ),
            ),
          ),

          // 4. FLOATING PIP (Picture-In-Picture) for teammate / local preview
          Positioned(
            top: 100,
            right: 16,
            child: Container(
              width: 100,
              height: 140,
              decoration: BoxDecoration(
                color: const Color(0xFF1F2937),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white24, width: 1.5),
                boxShadow: const <BoxShadow>[
                  BoxShadow(
                    color: Colors.black45,
                    blurRadius: 10,
                    offset: Offset(0, 4),
                  ),
                ],
              ),
              clipBehavior: Clip.antiAlias,
              child: Stack(
                children: <Widget>[
                  const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        CircleAvatar(
                          radius: 22,
                          backgroundColor: AppColors.primary,
                          child:
                              Icon(Icons.person, color: Colors.white, size: 24),
                        ),
                        SizedBox(height: 6),
                        Text(
                          'Đồng đội',
                          style: TextStyle(color: Colors.white70, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  Positioned(
                    bottom: 4,
                    right: 4,
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: const BoxDecoration(
                        color: Color(0xFF10B981),
                        shape: BoxShape.circle,
                      ),
                      child:
                          const Icon(Icons.mic, size: 10, color: Colors.white),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // 5. BOTTOM CALL CONTROLS
          Positioned(
            bottom: 36,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: <Widget>[
                // Mute Audio Button
                _buildActionButton(
                  icon: _isMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
                  label: _isMuted ? 'Bật Mic' : 'Tắt Mic',
                  isActive: !_isMuted,
                  onPressed: _toggleMute,
                ),

                // Toggle Camera / Video Button
                _buildActionButton(
                  icon: _isVideoEnabled
                      ? Icons.videocam_rounded
                      : Icons.videocam_off_rounded,
                  label: _isVideoEnabled ? 'Tắt Cam' : 'Bật Cam',
                  isActive: _isVideoEnabled,
                  onPressed: _toggleVideo,
                ),

                // Switch Camera Button
                _buildActionButton(
                  icon: Icons.cameraswitch_rounded,
                  label: _isFrontCamera ? 'Cam Trước' : 'Cam Sau',
                  isActive: true,
                  onPressed: _toggleCamera,
                ),

                // End Call Button (Big Red)
                GestureDetector(
                  onTap: _endCall,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Container(
                        width: 56,
                        height: 56,
                        decoration: const BoxDecoration(
                          color: AppColors.error,
                          shape: BoxShape.circle,
                          boxShadow: <BoxShadow>[
                            BoxShadow(
                              color: Color(0x66EF4444),
                              blurRadius: 12,
                              offset: Offset(0, 4),
                            ),
                          ],
                        ),
                        child: const Icon(Icons.call_end_rounded,
                            color: Colors.white, size: 28),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Kết thúc',
                        style: TextStyle(
                            color: Colors.white70,
                            fontSize: 12,
                            fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMainVideoFeed() {
    if (!_isVideoEnabled) {
      return Container(
        color: const Color(0xFF111827),
        child: const Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              CircleAvatar(
                radius: 46,
                backgroundColor: Color(0xFF374151),
                child: Icon(Icons.videocam_off_rounded,
                    size: 40, color: Colors.white54),
              ),
              SizedBox(height: 14),
              Text(
                'Camera của bạn đang tắt',
                style: TextStyle(
                    color: Colors.white70,
                    fontSize: 15,
                    fontWeight: FontWeight.w500),
              ),
            ],
          ),
        ),
      );
    }

    if (_isCameraInitialized && _cameraController != null) {
      return Center(
        child: CameraPreview(_cameraController!),
      );
    }

    // Fallback when camera is loading or not available on simulator
    return Container(
      color: const Color(0xFF111827),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const RadialGradient(
                  colors: <Color>[AppColors.primary, Color(0xFF1E1B4B)],
                ),
                border: Border.all(color: Colors.white24, width: 2),
              ),
              child: const Icon(Icons.videocam_rounded,
                  size: 48, color: Colors.white),
            ),
            const SizedBox(height: 16),
            Text(
              _cameraErrorMessage ?? 'Đang kết nối Camera thiết bị...',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionButton({
    required IconData icon,
    required String label,
    required bool isActive,
    required VoidCallback onPressed,
  }) {
    return GestureDetector(
      onTap: onPressed,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              color: isActive
                  ? Colors.white.withValues(alpha: 0.2)
                  : Colors.white10,
              shape: BoxShape.circle,
              border: Border.all(
                color: isActive ? Colors.white38 : Colors.white12,
              ),
            ),
            child: Icon(
              icon,
              color: isActive ? Colors.white : Colors.white38,
              size: 24,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: const TextStyle(
                color: Colors.white70,
                fontSize: 11.5,
                fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}
