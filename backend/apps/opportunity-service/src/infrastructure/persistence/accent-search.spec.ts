import { accentInsensitivePattern } from './opportunity.repository';

describe('accentInsensitivePattern', () => {
  const matches = (keyword: string, text: string) => new RegExp(accentInsensitivePattern(keyword), 'i').test(text);

  it('finds accented text from a keyword typed without accents', () => {
    expect(matches('hoc bong', 'Học bổng Phát triển Sinh viên Nữ')).toBe(true);
    expect(matches('dai hoc', 'Trường Đại học Bách Khoa')).toBe(true);
    expect(matches('nu cong nghe', 'Sinh viên Nữ Công nghệ FPT')).toBe(true);
  });

  it('still works when the keyword has accents or other casing', () => {
    expect(matches('Đại Học', 'dai hoc mo')).toBe(true);
    expect(matches('HỌC BỔNG', 'học bổng')).toBe(true);
  });

  it('does not match unrelated text and escapes regex characters', () => {
    expect(matches('hoc bong', 'Cuộc thi AI')).toBe(false);
    expect(matches('c++ (2026)', 'Khoá C++ (2026)')).toBe(true);
    expect(matches('a.b', 'axb')).toBe(false);
  });
});
