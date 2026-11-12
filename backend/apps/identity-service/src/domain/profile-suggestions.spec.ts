import { foldVietnamese, suggestProfileValues } from './profile-suggestions';

describe('suggestProfileValues (Passport autocomplete)', () => {
  it('matches regions without diacritics, by ISO code and by a merged province name', () => {
    expect(suggestProfileValues('region', 'ha noi')[0].value).toBe('Hà Nội');
    expect(suggestProfileValues('region', 'VN-SG')[0].value).toBe('TP. Hồ Chí Minh');
    const old = suggestProfileValues('region', 'Bình Dương');
    expect(old.map((s) => s.value)).toEqual(['TP. Hồ Chí Minh']);
    expect(old[0].detail).toContain('Bình Dương');
  });

  it('ranks names that start with the query first and respects the limit', () => {
    const res = suggestProfileValues('region', 'quang', { limit: 3 });
    expect(res).toHaveLength(3);
    expect(res.every((s) => foldVietnamese(s.value).startsWith('quang'))).toBe(true);
  });

  it('finds institutions by name or abbreviation', () => {
    expect(suggestProfileValues('institution', 'UIT')[0].value).toBe('Trường Đại học Công nghệ Thông tin - ĐHQG TP.HCM');
    expect(suggestProfileValues('institution', 'bach khoa').length).toBeGreaterThanOrEqual(3);
  });

  it('puts majors taught at the chosen institution first', () => {
    const res = suggestProfileValues('major', 'k', { institution: 'Trường Đại học Luật TP.HCM' });
    expect(res[0].value).toBe('Luật kinh tế');
    expect(res[0].detail).toBeDefined();
    // Empty query with a known school: that school's majors.
    const all = suggestProfileValues('major', '', { institution: 'Trường Đại học Công nghệ Thông tin - ĐHQG TP.HCM' });
    expect(all[0].value).toBe('Khoa học máy tính');
  });

  it('returns nothing for an empty or unknown query', () => {
    expect(suggestProfileValues('region', '')).toEqual([]);
    expect(suggestProfileValues('institution', 'zzzz')).toEqual([]);
    expect(suggestProfileValues('major', '')).toEqual([]);
  });
});
