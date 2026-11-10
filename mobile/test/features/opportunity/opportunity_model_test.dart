import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_model.dart';

void main() {
  group('Tuần 1 (F02) - OpportunityModel & BR10/BR11 Deadline Tests', () {
    test('OPP-01: Serializes and deserializes both SCHOLARSHIP and COMPETITION', () {
      const OpportunityModel scholarship = OpportunityModel(
        id: 'schol-1',
        type: OpportunityType.scholarship,
        title: 'Học bổng Khuyến học UIT',
        description: 'Mô tả học bổng',
        organizerName: 'UIT',
        applyMode: 'IN_APP',
        registerDeadline: '2026-12-31T23:59:59.000Z',
        fundingLevel: 'FULL',
        tags: <String>['IT', 'Scholarship'],
      );

      expect(scholarship.isScholarship, isTrue);
      expect(scholarship.isCompetition, isFalse);
      expect(scholarship.typeDisplay, equals('HỌC BỔNG'));

      final Map<String, dynamic> json = scholarship.toJson();
      expect(json['type'], equals('SCHOLARSHIP'));

      final OpportunityModel parsed = OpportunityModel.fromJson(json);
      expect(parsed.id, equals('schol-1'));
      expect(parsed.isScholarship, isTrue);
      expect(parsed.fundingLevel, equals('FULL'));

      const OpportunityModel competition = OpportunityModel(
        id: 'comp-1',
        type: OpportunityType.competition,
        title: 'Scholink Hackathon 2026',
        description: 'Mô tả cuộc thi',
        organizerName: 'Scholink',
        applyMode: 'EXTERNAL',
        registerDeadline: '2026-11-20T23:59:59.000Z',
        competitionMode: 'TEAM',
      );

      expect(competition.isCompetition, isTrue);
      expect(competition.isScholarship, isFalse);
      expect(competition.typeDisplay, equals('CUỘC THI'));
    });

    test('BR10 & BR11: Deadline calculations - Future, Due Today, and Expired', () {
      final DateTime now = DateTime.now();

      // 1. Expired deadline
      final OpportunityModel expiredOpp = OpportunityModel(
        id: 'exp-1',
        type: OpportunityType.scholarship,
        title: 'Học bổng đã hết hạn',
        description: 'Desc',
        organizerName: 'Org',
        applyMode: 'IN_APP',
        registerDeadline: now.subtract(const Duration(days: 2)).toIso8601String(),
      );
      expect(expiredOpp.deadlineInfo.isExpired, isTrue);
      expect(expiredOpp.deadlineInfo.statusText, equals('[ĐÃ ĐÓNG ĐĂNG KÝ]'));

      // 2. Future deadline (5 days left)
      final OpportunityModel futureOpp = OpportunityModel(
        id: 'fut-1',
        type: OpportunityType.scholarship,
        title: 'Học bổng còn hạn',
        description: 'Desc',
        organizerName: 'Org',
        applyMode: 'IN_APP',
        registerDeadline: now.add(const Duration(days: 5)).toIso8601String(),
      );
      expect(futureOpp.deadlineInfo.isExpired, isFalse);
      expect(futureOpp.deadlineInfo.statusText, contains('CÒN'));

      // 3. Due today
      final DateTime dueToday = DateTime(now.year, now.month, now.day, 23, 59, 59);
      final OpportunityModel dueTodayOpp = OpportunityModel(
        id: 'today-1',
        type: OpportunityType.scholarship,
        title: 'Học bổng hết hạn hôm nay',
        description: 'Desc',
        organizerName: 'Org',
        applyMode: 'IN_APP',
        registerDeadline: dueToday.toIso8601String(),
      );
      expect(dueTodayOpp.deadlineInfo.isDueToday, isTrue);
      expect(dueTodayOpp.deadlineInfo.statusText, contains('HẾT HẠN HÔM NAY'));
    });

    test('BR11: at the deadline instant registration is already closed (trước/tại/sau)', () {
      final DateTime deadline = DateTime(2026, 12, 10, 17, 0);
      final OpportunityModel opp = OpportunityModel(
        id: 'edge',
        type: OpportunityType.scholarship,
        title: 'Edge',
        description: '',
        organizerName: 'Org',
        applyMode: 'IN_APP',
        registerDeadline: deadline.toUtc().toIso8601String(),
      );

      expect(opp.deadlineInfoAt(deadline.subtract(const Duration(seconds: 1))).isExpired, isFalse);
      expect(opp.deadlineInfoAt(deadline).isExpired, isTrue);
      expect(opp.deadlineInfoAt(deadline.add(const Duration(seconds: 1))).isExpired, isTrue);
    });

    test('BR10: a date without time closes at 23:59:59; a UTC midnight timestamp is not moved', () {
      final DateTime dateOnly = parseDeadline('2026-12-31')!;
      expect(<int>[dateOnly.hour, dateOnly.minute, dateOnly.second], <int>[23, 59, 59]);

      final DateTime utcMidnight = parseDeadline('2026-12-31T00:00:00.000Z')!;
      expect(utcMidnight.isAtSameMomentAs(DateTime.utc(2026, 12, 31)), isTrue);
    });

    test('remaining days count calendar days in device time', () {
      final DateTime now = DateTime(2026, 11, 7, 20, 0);
      final OpportunityModel opp = OpportunityModel(
        id: 'tomorrow',
        type: OpportunityType.competition,
        title: 'T',
        description: '',
        organizerName: 'Org',
        applyMode: 'IN_APP',
        registerDeadline: DateTime(2026, 11, 8, 8, 0).toUtc().toIso8601String(),
      );
      expect(opp.deadlineInfoAt(now).statusText, '[CÒN 1 NGÀY]');
    });

    test('server eligibility rules (objects) are shown as readable sentences', () {
      final OpportunityModel opp = OpportunityModel.fromJson(<String, dynamic>{
        'id': 'r1',
        'type': 'SCHOLARSHIP',
        'title': 'Rule test',
        'applyMode': 'IN_APP',
        'registerDeadline': '2026-12-31T16:59:59.000Z',
        'eligibilityRules': <dynamic>[
          <String, dynamic>{'fieldKey': 'gpa', 'operator': 'GTE', 'value': 3.2, 'type': 'HARD'},
          <String, dynamic>{'fieldKey': 'ielts', 'operator': 'GTE', 'value': 6.5, 'type': 'SOFT'},
        ],
        'version': 4,
      });
      expect(opp.eligibilityRules, <String>['GPA từ 3.2 trở lên', 'IELTS từ 6.5 trở lên (ưu tiên)']);
      expect(opp.version, 4);
      // Survives the cache round trip as plain strings.
      expect(OpportunityModel.fromJson(opp.toJson()).eligibilityRules, opp.eligibilityRules);
    });

    test('BR11: Does not conflate submitDeadline with registerDeadline', () {
      const OpportunityModel opp = OpportunityModel(
        id: 'opp-diff-deadlines',
        type: OpportunityType.competition,
        title: 'Cuộc thi nghiên cứu',
        description: 'Desc',
        organizerName: 'Org',
        applyMode: 'IN_APP',
        registerDeadline: '2026-11-15T23:59:59.000Z',
        submitDeadline: '2026-11-25T23:59:59.000Z',
      );

      expect(opp.registerDeadline, isNot(equals(opp.submitDeadline)));
      expect(opp.formattedSubmitDeadline, isNotNull);
    });
  });
}

