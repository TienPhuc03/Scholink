/// Lower-cases and strips Vietnamese accents, so a search typed without accents
/// ("dai hoc") still finds "Đại học".
String foldVietnamese(String input) {
  final StringBuffer out = StringBuffer();
  for (final int rune in input.toLowerCase().runes) {
    final String ch = String.fromCharCode(rune);
    out.write(_base[ch] ?? ch);
  }
  return out.toString();
}

/// True when [text] contains [query], ignoring case and accents.
bool matchesSearch(String text, String query) =>
    foldVietnamese(text).contains(foldVietnamese(query.trim()));

final Map<String, String> _base = <String, String>{
  for (final MapEntry<String, String> e in <String, String>{
    'a': 'àáạảãâầấậẩẫăằắặẳẵ',
    'e': 'èéẹẻẽêềếệểễ',
    'i': 'ìíịỉĩ',
    'o': 'òóọỏõôồốộổỗơờớợởỡ',
    'u': 'ùúụủũưừứựửữ',
    'y': 'ỳýỵỷỹ',
    'd': 'đ',
  }.entries)
    for (final String v in e.value.split('')) v: e.key,
};
