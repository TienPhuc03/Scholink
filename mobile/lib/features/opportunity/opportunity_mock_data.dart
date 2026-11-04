import 'opportunity_model.dart';

/// Comprehensive mock data for Opportunity feature in Scholink Mobile Platform.
/// Provides rich scholarships and competitions with diverse deadlines, funding, and apply modes.
abstract final class OpportunityMockData {
  static List<OpportunityModel> getMockOpportunities() {
    final DateTime now = DateTime.now();

    final DateTime dueIn8Days = now.add(const Duration(days: 8));
    final DateTime dueIn3Days = now.add(const Duration(days: 3));
    final DateTime dueIn1Day = now.add(const Duration(days: 1));
    final DateTime dueToday = DateTime(now.year, now.month, now.day, 23, 59, 59);
    final DateTime closedYesterday = now.subtract(const Duration(days: 1));

    return <OpportunityModel>[
      // 1. SCHOLARSHIP - IN_APP
      OpportunityModel(
        id: 'opp-schol-001',
        type: OpportunityType.scholarship,
        title: 'Học bổng Tài năng Trẻ Tech Talent 2026',
        description: 'Chương trình học bổng toàn phần dành cho sinh viên ngành Khoa học Máy tính, Kỹ thuật Phần mềm có thành tích học tập xuất sắc và đam mê nghiên cứu công nghệ lõi.',
        organizerName: 'Tập đoàn Công nghệ FPT & Viện Nghiên cứu Trí tuệ Nhân tạo',
        applyMode: 'IN_APP',
        registerDeadline: dueIn8Days.toIso8601String(),
        submitDeadline: dueIn8Days.add(const Duration(days: 5)).toIso8601String(),
        fundingLevel: 'FULL',
        competitionMode: null,
        tags: const <String>['AI', 'ComputerScience', 'ToànPhần', 'CôngNghệ'],
        sourceUrl: 'https://fpt.com.vn/tech-talent-scholarship-2026',
        timezone: 'Asia/Ho_Chi_Minh',
        eligibilityRules: const <String>[
          'Sinh viên năm 2 hoặc năm 3 các trường Đại học khối ngành Công nghệ thông tin',
          'Điểm trung bình tích lũy GPA từ 3.2/4.0 trở lên',
          'Có ít nhất 1 bài nghiên cứu khoa học hoặc sản phẩm công nghệ công bố',
          'Trình độ tiếng Anh tương đương IELTS 6.0 hoặc TOEIC 700 trở lên',
        ],
        updatedAt: now.subtract(const Duration(hours: 2)).toIso8601String(),
        cachedAt: now.toIso8601String(),
        isBookmarked: true,
      ),

      // 2. SCHOLARSHIP - EXTERNAL (Nguồn ngoài, mở nguồn an toàn)
      OpportunityModel(
        id: 'opp-schol-002',
        type: OpportunityType.scholarship,
        title: 'Học bổng Trao đổi Khám phá Châu Âu Erasmus+ 2026-2027',
        description: 'Học bổng do Liên minh Châu Âu tài trợ, cung cấp cơ hội trao đổi 1 học kỳ tại các trường đại học hàng đầu Pháp, Đức, Hà Lan kèm trợ cấp sinh hoạt 850 Euro/tháng.',
        organizerName: 'Liên Minh Châu Âu (European Commission)',
        applyMode: 'EXTERNAL',
        registerDeadline: dueIn3Days.toIso8601String(),
        submitDeadline: null,
        fundingLevel: 'FULL',
        competitionMode: null,
        tags: const <String>['ChâuÂu', 'TraoĐổi', 'DuHọc', 'Erasmus'],
        sourceUrl: 'https://ec.europa.eu/programmes/erasmus-plus/opportunities/students_en',
        timezone: 'Europe/Brussels',
        eligibilityRules: const <String>[
          'Sinh viên chính quy đại học năm 2, 3 đã hoàn thành tối thiểu 60 tín chỉ',
          'GPA từ 3.0/4.0 trở lên',
          'Chứng chỉ IELTS tối thiểu 6.5 hoặc TOEFL iBT 80',
          'Thư giới thiệu từ Trưởng khoa hoặc Giảng viên hướng dẫn',
        ],
        updatedAt: now.subtract(const Duration(hours: 5)).toIso8601String(),
        cachedAt: now.toIso8601String(),
        isBookmarked: false,
      ),

      // 3. SCHOLARSHIP - PARTIAL IN_APP
      OpportunityModel(
        id: 'opp-schol-003',
        type: OpportunityType.scholarship,
        title: 'Học bổng Tiếp sức Ước mơ Sinh viên Vượt khó',
        description: 'Tài trợ 50% học phí và hỗ trợ thiết bị máy tính xách tay cho sinh viên có hoàn cảnh khó khăn nhưng giữ vững tinh thần vượt khó học tập đạt loại giỏi.',
        organizerName: 'Quỹ Khuyến học & Phát triển Xã hội Việt Nam',
        applyMode: 'IN_APP',
        registerDeadline: dueToday.toIso8601String(),
        submitDeadline: null,
        fundingLevel: 'PARTIAL',
        competitionMode: null,
        tags: const <String>['KhuyếnHọc', 'VượtKhó', 'BánPhần'],
        sourceUrl: 'https://khuyenhoc.vn/tiep-suc-uoc-mo',
        timezone: 'Asia/Ho_Chi_Minh',
        eligibilityRules: const <String>[
          'Sinh viên có sổ hộ nghèo hoặc hoàn cảnh đặc biệt khó khăn',
          'GPA năm học gần nhất từ 2.8/4.0 trở lên',
          'Tích cực tham gia các hoạt động Đoàn - Hội và cộng đồng',
        ],
        updatedAt: now.subtract(const Duration(hours: 12)).toIso8601String(),
        cachedAt: now.toIso8601String(),
        isBookmarked: false,
      ),

      // 4. COMPETITION - IN_APP (Team mode)
      OpportunityModel(
        id: 'opp-comp-001',
        type: OpportunityType.competition,
        title: 'Cuộc thi Sáng tạo Khởi nghiệp Công nghệ Sinh viên Scholink Hackathon 2026',
        description: 'Sân chơi sáng tạo giải pháp chuyển đổi số cho giáo dục và y tế. Các đội thi tranh tài trong 48 giờ liên tục để phát triển MVP và thuyết trình trước hội đồng đầu tư mạo hiểm.',
        organizerName: 'Đại học Quốc gia & Vườn ươm Doanh nghiệp Công nghệ',
        applyMode: 'IN_APP',
        registerDeadline: dueIn8Days.toIso8601String(),
        submitDeadline: dueIn8Days.add(const Duration(days: 10)).toIso8601String(),
        fundingLevel: null,
        competitionMode: 'TEAM',
        tags: const <String>['Hackathon', 'KhởiNghiệp', 'ĐộiThi', 'FinTech', 'EdTech'],
        sourceUrl: 'https://hackathon.scholink.edu.vn',
        timezone: 'Asia/Ho_Chi_Minh',
        eligibilityRules: const <String>[
          'Đội thi từ 3 đến 5 thành viên là sinh viên các trường Đại học, Cao đẳng',
          'Mỗi đội phải có ít nhất 1 thành viên phụ trách Lập trình và 1 phụ trách Thiết kế/Kinh doanh',
          'Sản phẩm chưa từng đạt giải tại các cuộc thi cấp quốc gia',
        ],
        updatedAt: now.subtract(const Duration(hours: 1)).toIso8601String(),
        cachedAt: now.toIso8601String(),
        isBookmarked: true,
      ),

      // 5. COMPETITION - EXTERNAL (Đăng ký tại nguồn)
      OpportunityModel(
        id: 'opp-comp-002',
        type: OpportunityType.competition,
        title: 'Thử thách An toàn Thông tin & Tác chiến Không gian mạng CyberShield 2026',
        description: 'Cuộc thi CTF quốc tế Jeopardy & Attack-Defense mô phỏng các mối đe dọa bảo mật nâng cao do các chuyên gia an ninh mạng bảo trợ.',
        organizerName: 'Hiệp hội An toàn Thông tin VNISA & Liên minh Bảo mật Cloud',
        applyMode: 'EXTERNAL',
        registerDeadline: dueIn1Day.toIso8601String(),
        submitDeadline: null,
        fundingLevel: null,
        competitionMode: 'TEAM',
        tags: const <String>['CTF', 'AnToànThôngTin', 'BảoMật', 'CyberSecurity'],
        sourceUrl: 'https://cybershield.vnisa.org.vn/register',
        timezone: 'Asia/Ho_Chi_Minh',
        eligibilityRules: const <String>[
          'Sinh viên chuyên ngành An toàn thông tin, Mạng máy tính hoặc Kỹ thuật phần mềm',
          'Đội thi tối đa 4 thành viên',
          'Tuân thủ quy tắc ứng xử đạo đức an ninh mạng',
        ],
        updatedAt: now.subtract(const Duration(hours: 8)).toIso8601String(),
        cachedAt: now.toIso8601String(),
        isBookmarked: false,
      ),

      // 6. COMPETITION - INDIVIDUAL CLOSED
      OpportunityModel(
        id: 'opp-comp-003',
        type: OpportunityType.competition,
        title: 'Giải thưởng Lập trình Thuật toán ICPC Vietnam National Contest',
        description: 'Vòng thi tuyển chọn đại diện tham dự ICPC Regional Asia. Giải quyết các bài toán cấu trúc dữ liệu và giải thuật phức tạp trong thời gian giới hạn 5 tiếng.',
        organizerName: 'Hội Tin học Việt Nam (VAIP)',
        applyMode: 'EXTERNAL',
        registerDeadline: closedYesterday.toIso8601String(),
        submitDeadline: null,
        fundingLevel: null,
        competitionMode: 'INDIVIDUAL',
        tags: const <String>['ICPC', 'ThuậtToán', 'CompetitiveProgramming'],
        sourceUrl: 'https://icpc.vietnam.acm.org',
        timezone: 'Asia/Ho_Chi_Minh',
        eligibilityRules: const <String>[
          'Sinh viên chính quy còn trong hạn thi đấu ICPC quốc tế',
          'Thành thạo C++, Java hoặc Python',
        ],
        updatedAt: now.subtract(const Duration(days: 2)).toIso8601String(),
        cachedAt: now.toIso8601String(),
        isBookmarked: false,
      ),
    ];
  }
}

