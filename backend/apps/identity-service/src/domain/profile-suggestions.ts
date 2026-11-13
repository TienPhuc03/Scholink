/**
 * Reference lists behind the Passport autocomplete (region, institution, major).
 * Suggestions only: the Passport still accepts values that are not listed.
 *
 * Regions are the 34 provinces and cities after the 1 July 2025 merger; `code` is the ISO
 * 3166-2:VN code of the unit that kept its name, and `formerly` lists the merged provinces so
 * typing an old name still finds the new one.
 */
export type SuggestionField = 'region' | 'institution' | 'major';

export interface ProfileSuggestion {
  readonly value: string;
  readonly detail?: string;
}

type Group = 'it' | 'eng' | 'econ' | 'law' | 'med' | 'edu' | 'lang' | 'social' | 'media' | 'science' | 'arch' | 'agri';

const REGIONS: ReadonlyArray<{ name: string; code: string; formerly?: string[]; aliases?: string[] }> = [
  { name: 'Hà Nội', code: 'VN-HN' },
  { name: 'TP. Hồ Chí Minh', code: 'VN-SG', formerly: ['Bình Dương', 'Bà Rịa - Vũng Tàu'], aliases: ['Sài Gòn', 'HCM', 'Thành phố Hồ Chí Minh'] },
  { name: 'Hải Phòng', code: 'VN-HP', formerly: ['Hải Dương'] },
  { name: 'Đà Nẵng', code: 'VN-DN', formerly: ['Quảng Nam'] },
  { name: 'Cần Thơ', code: 'VN-CT', formerly: ['Sóc Trăng', 'Hậu Giang'] },
  { name: 'Huế', code: 'VN-26', aliases: ['Thừa Thiên Huế'] },
  { name: 'Lai Châu', code: 'VN-01' },
  { name: 'Điện Biên', code: 'VN-71' },
  { name: 'Sơn La', code: 'VN-05' },
  { name: 'Lạng Sơn', code: 'VN-09' },
  { name: 'Quảng Ninh', code: 'VN-13' },
  { name: 'Thanh Hóa', code: 'VN-21' },
  { name: 'Nghệ An', code: 'VN-22' },
  { name: 'Hà Tĩnh', code: 'VN-23' },
  { name: 'Cao Bằng', code: 'VN-04' },
  { name: 'Tuyên Quang', code: 'VN-07', formerly: ['Hà Giang'] },
  { name: 'Lào Cai', code: 'VN-02', formerly: ['Yên Bái'] },
  { name: 'Thái Nguyên', code: 'VN-69', formerly: ['Bắc Kạn'] },
  { name: 'Phú Thọ', code: 'VN-68', formerly: ['Vĩnh Phúc', 'Hòa Bình'] },
  { name: 'Bắc Ninh', code: 'VN-56', formerly: ['Bắc Giang'] },
  { name: 'Hưng Yên', code: 'VN-66', formerly: ['Thái Bình'] },
  { name: 'Ninh Bình', code: 'VN-18', formerly: ['Hà Nam', 'Nam Định'] },
  { name: 'Quảng Trị', code: 'VN-25', formerly: ['Quảng Bình'] },
  { name: 'Quảng Ngãi', code: 'VN-29', formerly: ['Kon Tum'] },
  { name: 'Gia Lai', code: 'VN-30', formerly: ['Bình Định'] },
  { name: 'Khánh Hòa', code: 'VN-34', formerly: ['Ninh Thuận'] },
  { name: 'Lâm Đồng', code: 'VN-35', formerly: ['Đắk Nông', 'Bình Thuận'] },
  { name: 'Đắk Lắk', code: 'VN-33', formerly: ['Phú Yên'] },
  { name: 'Đồng Nai', code: 'VN-39', formerly: ['Bình Phước'] },
  { name: 'Tây Ninh', code: 'VN-37', formerly: ['Long An'] },
  { name: 'Vĩnh Long', code: 'VN-49', formerly: ['Bến Tre', 'Trà Vinh'] },
  { name: 'Đồng Tháp', code: 'VN-45', formerly: ['Tiền Giang'] },
  { name: 'Cà Mau', code: 'VN-59', formerly: ['Bạc Liêu'] },
  { name: 'An Giang', code: 'VN-44', formerly: ['Kiên Giang'] },
];

const INSTITUTIONS: ReadonlyArray<{ name: string; short: string; focus: Group[] }> = [
  { name: 'Đại học Bách khoa Hà Nội', short: 'HUST', focus: ['eng', 'it', 'science'] },
  { name: 'Trường Đại học Công nghệ - ĐHQG Hà Nội', short: 'UET', focus: ['it', 'eng'] },
  { name: 'Trường Đại học Khoa học Tự nhiên - ĐHQG Hà Nội', short: 'HUS', focus: ['science', 'it'] },
  { name: 'Trường Đại học Khoa học Xã hội và Nhân văn - ĐHQG Hà Nội', short: 'USSH', focus: ['social', 'media'] },
  { name: 'Trường Đại học Ngoại ngữ - ĐHQG Hà Nội', short: 'ULIS', focus: ['lang', 'edu'] },
  { name: 'Trường Đại học Kinh tế - ĐHQG Hà Nội', short: 'UEB', focus: ['econ'] },
  { name: 'Đại học Kinh tế Quốc dân', short: 'NEU', focus: ['econ', 'it', 'law'] },
  { name: 'Trường Đại học Ngoại thương', short: 'FTU', focus: ['econ', 'lang', 'law'] },
  { name: 'Học viện Công nghệ Bưu chính Viễn thông', short: 'PTIT', focus: ['it', 'eng', 'media'] },
  { name: 'Học viện Kỹ thuật Mật mã', short: 'KMA', focus: ['it'] },
  { name: 'Học viện Ngân hàng', short: 'BA', focus: ['econ'] },
  { name: 'Học viện Tài chính', short: 'AOF', focus: ['econ'] },
  { name: 'Học viện Ngoại giao', short: 'DAV', focus: ['social', 'econ', 'lang', 'law'] },
  { name: 'Học viện Báo chí và Tuyên truyền', short: 'AJC', focus: ['media', 'social'] },
  { name: 'Học viện Nông nghiệp Việt Nam', short: 'VNUA', focus: ['agri', 'science'] },
  { name: 'Trường Đại học Thương mại', short: 'TMU', focus: ['econ'] },
  { name: 'Trường Đại học Xây dựng Hà Nội', short: 'HUCE', focus: ['eng', 'arch'] },
  { name: 'Trường Đại học Giao thông Vận tải', short: 'UTC', focus: ['eng', 'it'] },
  { name: 'Trường Đại học Thủy lợi', short: 'TLU', focus: ['eng', 'it'] },
  { name: 'Trường Đại học Mỏ - Địa chất', short: 'HUMG', focus: ['eng'] },
  { name: 'Trường Đại học Điện lực', short: 'EPU', focus: ['eng', 'it'] },
  { name: 'Trường Đại học Kiến trúc Hà Nội', short: 'HAU', focus: ['arch'] },
  { name: 'Trường Đại học Y Hà Nội', short: 'HMU', focus: ['med'] },
  { name: 'Trường Đại học Dược Hà Nội', short: 'HUP', focus: ['med'] },
  { name: 'Trường Đại học Sư phạm Hà Nội', short: 'HNUE', focus: ['edu', 'science'] },
  { name: 'Trường Đại học Hà Nội', short: 'HANU', focus: ['lang', 'econ'] },
  { name: 'Trường Đại học Luật Hà Nội', short: 'HLU', focus: ['law'] },
  { name: 'Trường Đại học Công nghiệp Hà Nội', short: 'HaUI', focus: ['eng', 'it', 'econ'] },
  { name: 'Trường Đại học FPT', short: 'FPTU', focus: ['it', 'econ', 'lang', 'media'] },
  { name: 'Trường Đại học Phenikaa', short: 'Phenikaa', focus: ['it', 'eng', 'med'] },
  { name: 'Trường Đại học VinUni', short: 'VinUni', focus: ['it', 'econ', 'med'] },
  { name: 'Trường Đại học Bách khoa - ĐHQG TP.HCM', short: 'HCMUT', focus: ['eng', 'it', 'science'] },
  { name: 'Trường Đại học Khoa học Tự nhiên - ĐHQG TP.HCM', short: 'HCMUS', focus: ['science', 'it'] },
  { name: 'Trường Đại học Công nghệ Thông tin - ĐHQG TP.HCM', short: 'UIT', focus: ['it'] },
  { name: 'Trường Đại học Kinh tế - Luật - ĐHQG TP.HCM', short: 'UEL', focus: ['econ', 'law'] },
  { name: 'Trường Đại học Quốc tế - ĐHQG TP.HCM', short: 'IU', focus: ['econ', 'it', 'eng'] },
  { name: 'Trường Đại học Khoa học Xã hội và Nhân văn - ĐHQG TP.HCM', short: 'USSH', focus: ['social', 'media', 'lang'] },
  { name: 'Đại học Kinh tế TP.HCM', short: 'UEH', focus: ['econ', 'it', 'law'] },
  { name: 'Trường Đại học Sư phạm Kỹ thuật TP.HCM', short: 'HCMUTE', focus: ['eng', 'it'] },
  { name: 'Trường Đại học Tôn Đức Thắng', short: 'TDTU', focus: ['eng', 'it', 'econ', 'law'] },
  { name: 'Trường Đại học Ngân hàng TP.HCM', short: 'HUB', focus: ['econ'] },
  { name: 'Trường Đại học Luật TP.HCM', short: 'ULAW', focus: ['law'] },
  { name: 'Đại học Y Dược TP.HCM', short: 'UMP', focus: ['med'] },
  { name: 'Trường Đại học Y khoa Phạm Ngọc Thạch', short: 'PNT', focus: ['med'] },
  { name: 'Trường Đại học Sư phạm TP.HCM', short: 'HCMUE', focus: ['edu', 'lang'] },
  { name: 'Trường Đại học Công nghiệp TP.HCM', short: 'IUH', focus: ['eng', 'it', 'econ'] },
  { name: 'Trường Đại học Tài chính - Marketing', short: 'UFM', focus: ['econ'] },
  { name: 'Trường Đại học Nông Lâm TP.HCM', short: 'NLU', focus: ['agri', 'science'] },
  { name: 'Trường Đại học Giao thông Vận tải TP.HCM', short: 'UTH', focus: ['eng', 'econ'] },
  { name: 'Trường Đại học Kiến trúc TP.HCM', short: 'UAH', focus: ['arch'] },
  { name: 'Trường Đại học Mở TP.HCM', short: 'OU', focus: ['econ', 'it', 'law', 'lang'] },
  { name: 'Trường Đại học Công nghệ TP.HCM', short: 'HUTECH', focus: ['it', 'eng', 'econ'] },
  { name: 'Trường Đại học Văn Lang', short: 'VLU', focus: ['it', 'econ', 'arch', 'media'] },
  { name: 'Trường Đại học Nguyễn Tất Thành', short: 'NTTU', focus: ['med', 'it', 'econ'] },
  { name: 'Trường Đại học RMIT Việt Nam', short: 'RMIT', focus: ['econ', 'it', 'media'] },
  { name: 'Trường Đại học Bách khoa - Đại học Đà Nẵng', short: 'DUT', focus: ['eng', 'it', 'arch'] },
  { name: 'Trường Đại học Kinh tế - Đại học Đà Nẵng', short: 'DUE', focus: ['econ'] },
  { name: 'Trường Đại học Sư phạm - Đại học Đà Nẵng', short: 'UED', focus: ['edu', 'science'] },
  { name: 'Trường Đại học Duy Tân', short: 'DTU', focus: ['it', 'econ', 'med'] },
  { name: 'Trường Đại học Y - Dược, Đại học Huế', short: 'HUEUMP', focus: ['med'] },
  { name: 'Trường Đại học Khoa học, Đại học Huế', short: 'HUSC', focus: ['science', 'it', 'social'] },
  { name: 'Trường Đại học Cần Thơ', short: 'CTU', focus: ['agri', 'it', 'econ', 'eng'] },
  { name: 'Trường Đại học Vinh', short: 'VinhUni', focus: ['edu', 'eng', 'econ'] },
  { name: 'Trường Đại học Quy Nhơn', short: 'QNU', focus: ['edu', 'science'] },
  { name: 'Trường Đại học Nha Trang', short: 'NTU', focus: ['agri', 'econ', 'eng'] },
  { name: 'Trường Đại học Đà Lạt', short: 'DLU', focus: ['science', 'social'] },
  { name: 'Đại học Thái Nguyên', short: 'TNU', focus: ['edu', 'med', 'eng', 'agri'] },
  { name: 'Trường Đại học Hàng hải Việt Nam', short: 'VMU', focus: ['eng', 'econ'] },
  { name: 'Trường Đại học Tây Nguyên', short: 'TTN', focus: ['agri', 'med', 'edu'] },
];

const MAJORS: ReadonlyArray<{ name: string; group: Group }> = [
  { name: 'Khoa học máy tính', group: 'it' },
  { name: 'Kỹ thuật phần mềm', group: 'it' },
  { name: 'Công nghệ thông tin', group: 'it' },
  { name: 'Hệ thống thông tin', group: 'it' },
  { name: 'An toàn thông tin', group: 'it' },
  { name: 'Trí tuệ nhân tạo', group: 'it' },
  { name: 'Khoa học dữ liệu', group: 'it' },
  { name: 'Kỹ thuật máy tính', group: 'it' },
  { name: 'Mạng máy tính và truyền thông dữ liệu', group: 'it' },
  { name: 'Kỹ thuật điện tử - viễn thông', group: 'eng' },
  { name: 'Kỹ thuật điện', group: 'eng' },
  { name: 'Kỹ thuật điều khiển và tự động hóa', group: 'eng' },
  { name: 'Kỹ thuật cơ khí', group: 'eng' },
  { name: 'Kỹ thuật cơ điện tử', group: 'eng' },
  { name: 'Kỹ thuật ô tô', group: 'eng' },
  { name: 'Kỹ thuật xây dựng', group: 'eng' },
  { name: 'Kỹ thuật hóa học', group: 'eng' },
  { name: 'Kỹ thuật môi trường', group: 'eng' },
  { name: 'Quản trị kinh doanh', group: 'econ' },
  { name: 'Marketing', group: 'econ' },
  { name: 'Kinh doanh quốc tế', group: 'econ' },
  { name: 'Tài chính - Ngân hàng', group: 'econ' },
  { name: 'Công nghệ tài chính', group: 'econ' },
  { name: 'Kế toán', group: 'econ' },
  { name: 'Kiểm toán', group: 'econ' },
  { name: 'Kinh tế', group: 'econ' },
  { name: 'Kinh tế quốc tế', group: 'econ' },
  { name: 'Thương mại điện tử', group: 'econ' },
  { name: 'Logistics và quản lý chuỗi cung ứng', group: 'econ' },
  { name: 'Quản trị nhân lực', group: 'econ' },
  { name: 'Quản trị khách sạn', group: 'econ' },
  { name: 'Quản trị dịch vụ du lịch và lữ hành', group: 'econ' },
  { name: 'Luật', group: 'law' },
  { name: 'Luật kinh tế', group: 'law' },
  { name: 'Luật quốc tế', group: 'law' },
  { name: 'Y khoa', group: 'med' },
  { name: 'Dược học', group: 'med' },
  { name: 'Răng - Hàm - Mặt', group: 'med' },
  { name: 'Điều dưỡng', group: 'med' },
  { name: 'Y học cổ truyền', group: 'med' },
  { name: 'Kỹ thuật xét nghiệm y học', group: 'med' },
  { name: 'Sư phạm Toán học', group: 'edu' },
  { name: 'Sư phạm Ngữ văn', group: 'edu' },
  { name: 'Sư phạm Tiếng Anh', group: 'edu' },
  { name: 'Giáo dục Tiểu học', group: 'edu' },
  { name: 'Giáo dục Mầm non', group: 'edu' },
  { name: 'Ngôn ngữ Anh', group: 'lang' },
  { name: 'Ngôn ngữ Nhật', group: 'lang' },
  { name: 'Ngôn ngữ Hàn Quốc', group: 'lang' },
  { name: 'Ngôn ngữ Trung Quốc', group: 'lang' },
  { name: 'Ngôn ngữ Pháp', group: 'lang' },
  { name: 'Tâm lý học', group: 'social' },
  { name: 'Quan hệ quốc tế', group: 'social' },
  { name: 'Xã hội học', group: 'social' },
  { name: 'Việt Nam học', group: 'social' },
  { name: 'Đông phương học', group: 'social' },
  { name: 'Báo chí', group: 'media' },
  { name: 'Truyền thông đa phương tiện', group: 'media' },
  { name: 'Quan hệ công chúng', group: 'media' },
  { name: 'Thiết kế đồ họa', group: 'media' },
  { name: 'Toán học', group: 'science' },
  { name: 'Toán ứng dụng', group: 'science' },
  { name: 'Vật lý học', group: 'science' },
  { name: 'Hóa học', group: 'science' },
  { name: 'Sinh học', group: 'science' },
  { name: 'Công nghệ sinh học', group: 'science' },
  { name: 'Kiến trúc', group: 'arch' },
  { name: 'Thiết kế nội thất', group: 'arch' },
  { name: 'Quy hoạch vùng và đô thị', group: 'arch' },
  { name: 'Nông học', group: 'agri' },
  { name: 'Thú y', group: 'agri' },
  { name: 'Công nghệ thực phẩm', group: 'agri' },
];

/** Lower case without Vietnamese diacritics, so "ha noi" finds "Hà Nội". */
export const foldVietnamese = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 0 = starts with the query, 1 = a word starts with it, 2 = contains it, -1 = no match.
 * terms[0] is the name; matches on the other terms (codes, old names) rank after any name match.
 */
const rank = (terms: string[], q: string): number => {
  let best = -1;
  terms.map(foldVietnamese).forEach((term, i) => {
    const hit = term.startsWith(q) ? 0 : (' ' + term).includes(' ' + q) ? 1 : term.includes(q) ? 2 : -1;
    const r = hit === -1 ? -1 : hit + (i === 0 ? 0 : 3);
    if (r !== -1 && (best === -1 || r < best)) best = r;
  });
  return best;
};

const pick = <T>(items: readonly T[], q: string, terms: (t: T) => string[], boost: (t: T) => boolean, limit: number) =>
  items
    .map((item, index) => ({ item, index, r: rank(terms(item), q), boosted: boost(item) }))
    .filter((x) => x.r !== -1)
    .sort((a, b) => Number(b.boosted) - Number(a.boosted) || a.r - b.r || a.index - b.index)
    .slice(0, limit);

/**
 * Up to `limit` suggestions for `query`. For majors, those taught at `institution` (by the
 * school's main fields) come first; with an empty query they are the whole suggestion list.
 */
export const suggestProfileValues = (
  field: SuggestionField,
  query: string,
  options: { institution?: string; limit?: number } = {},
): ProfileSuggestion[] => {
  const q = foldVietnamese(query ?? '');
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 20);

  if (field === 'region') {
    if (!q) return [];
    return pick(REGIONS, q, (r) => [r.name, r.code, ...(r.formerly ?? []), ...(r.aliases ?? [])], () => false, limit).map(
      ({ item }) => ({
        value: item.name,
        detail: item.formerly ? `${item.code} · gồm cả ${item.formerly.join(', ')}` : item.code,
      }),
    );
  }

  if (field === 'institution') {
    if (!q) return [];
    return pick(INSTITUTIONS, q, (i) => [i.name, i.short], () => false, limit).map(({ item }) => ({
      value: item.name,
      detail: item.short,
    }));
  }

  const school = options.institution ? foldVietnamese(options.institution) : '';
  const focus = new Set(INSTITUTIONS.find((i) => foldVietnamese(i.name) === school)?.focus ?? []);
  if (!q && focus.size === 0) return [];
  const matches = q
    ? pick(MAJORS, q, (m) => [m.name], (m) => focus.has(m.group), limit)
    : MAJORS.filter((m) => focus.has(m.group)).slice(0, limit).map((item) => ({ item, boosted: true }));
  return matches.map(({ item, boosted }) => ({
    value: item.name,
    ...(boosted ? { detail: 'Ngành đào tạo của trường đã chọn' } : {}),
  }));
};
