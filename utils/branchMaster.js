const OFFICIAL_BRANCHES = [
  { branchName: 'Jaffna (Kondavil)', branchCode: 'JK', branchId: 'BR-JK-001' },
  { branchName: 'Jaffna (Chavakachcheri)', branchCode: 'JS', branchId: 'BR-JS-001' },
  { branchName: 'Kalmunai', branchCode: 'KM', branchId: 'BR-KM-001' },
  { branchName: 'Akkaraipattu', branchCode: 'AP', branchId: 'BR-AP-001' },
  { branchName: 'Ampara', branchCode: 'AM', branchId: 'BR-AM-001' },
  { branchName: 'Batticaloa', branchCode: 'BT', branchId: 'BR-BT-001' },
  { branchName: 'Cheddikulam', branchCode: 'CK', branchId: 'BR-CK-001' },
  { branchName: 'Kilinochchi', branchCode: 'KN', branchId: 'BR-KN-001' },
  { branchName: 'Mannar', branchCode: 'MN', branchId: 'BR-MN-001' },
  { branchName: 'Vavuniya', branchCode: 'VN', branchId: 'BR-VN-001' },
  { branchName: 'Mallavi', branchCode: 'MV', branchId: 'BR-MV-001' },
  { branchName: 'Mulliyawalai', branchCode: 'MW', branchId: 'BR-MW-001' },
  { branchName: 'Nedunkeny', branchCode: 'NK', branchId: 'BR-NK-001' },
  { branchName: 'Puthukkudiyiruppu', branchCode: 'PK', branchId: 'BR-PK-001' },
  { branchName: 'Tharmapuram', branchCode: 'TP', branchId: 'BR-TP-001' },
  { branchName: 'Visuvamadu', branchCode: 'VM', branchId: 'BR-VM-001' },
  { branchName: 'Anuradhapura', branchCode: 'AD', branchId: 'BR-AD-001' },
  { branchName: 'Poonakary', branchCode: 'PO', branchId: 'BR-PO-001' },
  { branchName: 'Aschuveli', branchCode: 'AV', branchId: 'BR-AV-001' },
  { branchName: 'Kandawalai', branchCode: 'KA', branchId: 'BR-KA-001' },
  { branchName: 'Karachchi', branchCode: 'KC', branchId: 'BR-KC-001' },
];

const OFFICIAL_BRANCH_CODES = OFFICIAL_BRANCHES.map((branch) => branch.branchCode);
const LEGACY_BRANCH_ALIASES = {
  'BR-AK-001': 'AP',
  'BR-PO-001': 'PO',
  'BR-PU-001': 'PK',
  'BR-TH-001': 'TP',
  'JF-CV-001': 'JS',
  KA001: 'KA',
  'BR-KA-002': 'KA',
  PL: 'PO',
};

function normalizeBranchCode(value) {
  return String(value || '').trim().toUpperCase();
}

function buildBranchId(branchCode, sequence = 1) {
  return `BR-${normalizeBranchCode(branchCode)}-${String(sequence).padStart(3, '0')}`;
}

function getOfficialBranchByCode(branchCode) {
  const normalizedCode = normalizeBranchCode(branchCode);
  return OFFICIAL_BRANCHES.find((branch) => branch.branchCode === normalizedCode) || null;
}

function getOfficialBranchByName(branchName) {
  const normalizedName = String(branchName || '').trim().toLowerCase();
  return (
    OFFICIAL_BRANCHES.find((branch) => branch.branchName.trim().toLowerCase() === normalizedName) || null
  );
}

function getOfficialBranchByBranchId(branchId) {
  const normalizedId = normalizeBranchCode(branchId);
  return OFFICIAL_BRANCHES.find((branch) => normalizeBranchCode(branch.branchId) === normalizedId) || null;
}

function resolveOfficialBranch(value, fallbackName) {
  const normalizedValue = normalizeBranchCode(value);
  const aliasCode = LEGACY_BRANCH_ALIASES[normalizedValue];
  return (
    getOfficialBranchByCode(normalizedValue) ||
    getOfficialBranchByBranchId(normalizedValue) ||
    getOfficialBranchByCode(aliasCode) ||
    getOfficialBranchByName(fallbackName) ||
    null
  );
}

function isOfficialBranchCode(branchCode) {
  return OFFICIAL_BRANCH_CODES.includes(normalizeBranchCode(branchCode));
}

function buildOfficialBranchQuery(extra = {}) {
  return {
    branchName: { $exists: true, $ne: null },
    branchCode: { $in: OFFICIAL_BRANCH_CODES },
    ...extra,
  };
}

module.exports = {
  OFFICIAL_BRANCHES,
  OFFICIAL_BRANCH_CODES,
  buildOfficialBranchQuery,
  buildBranchId,
  getOfficialBranchByCode,
  getOfficialBranchByBranchId,
  getOfficialBranchByName,
  resolveOfficialBranch,
  isOfficialBranchCode,
  normalizeBranchCode,
};
