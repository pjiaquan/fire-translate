function isApiKeyLike(text) {
  const trimmed = text.trim();
  if (/^gsk_[a-zA-Z0-9_-]{15,}/.test(trimmed)) return true;
  if (/^sk-(proj-|or-|ant-)?[a-zA-Z0-9_-]{15,}/.test(trimmed)) return true;
  if (/^AIza[0-9A-Za-z_-]{25,}/.test(trimmed)) return true;
  if (/^ya29\.[0-9A-Za-z_-]{25,}/.test(trimmed)) return true;
  if (/^hf_[a-zA-Z0-9]{15,}/.test(trimmed)) return true;
  if (/^\d{8,10}:[a-zA-Z0-9_-]{30,}/.test(trimmed)) return true;
  if (/^(ghp_|github_pat_)[a-zA-Z0-9_-]{15,}/.test(trimmed)) return true;
  if (/^[a-zA-Z0-9_-]{30,}$/.test(trimmed) && /[0-9]/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) return true;
  return false;
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = { isApiKeyLike };
}
