import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  IconButton,
  useMediaQuery,
  useTheme,
  Card,
  CardContent,
  Chip,
  InputAdornment,
  CircularProgress,
  Button,
  Tabs,
  Tab,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import { Helmet } from "react-helmet-async";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import DownloadIcon from "@mui/icons-material/Download";
import TuneIcon from "@mui/icons-material/Tune";
import PeopleIcon from "@mui/icons-material/People";

const ADMIN_PHONE = "9438046114";
const ADMIN_PASSWORD = "424614";

// Default valuation config (mirrors Sell.jsx)
const DEFAULT_CONFIG = {
  ageDepreciation: { 0: 0.90, 1: 0.85, 2: 0.80, 3: 0.75, 4: 0.60, 5: 0.55, 6: 0.50, 7: 0.45 },
  fallbackDepreciation: 0.30,
  brandFactors: {
    "Maruti Suzuki": 1.05, "Hyundai": 1.05, "Toyota": 1.07, "Tata": 1.05,
    "Honda": 1.03, "Kia": 1.03, "Mahindra": 1.02, "MG": 0.98,
    "Volkswagen": 0.95, "Skoda": 0.95, "Renault": 0.92, "Nissan": 0.93,
    "Ford": 0.90, "Jeep": 0.97, "BMW": 0.93, "Mercedes-Benz": 0.94,
    "Audi": 0.93, "Volvo": 0.94, "Land Rover": 0.92, "Jaguar": 0.90,
    "Mini": 0.90, "Porsche": 0.96, "Lexus": 0.95, "Isuzu": 0.93,
    "Citroen": 0.90, "BYD": 0.90, "Datsun": 0.88, "Fiat": 0.85,
    "Mitsubishi": 0.88, "Chevrolet": 0.85, "Other": 0.92,
  },
  demandFactors: { "High": 1.08, "Medium": 1.03, "Low": 0.92 },
  conditionAdjustments: { "Excellent": 30000, "Good": 25000, "Average": 15000, "Below Average": -10000 },
  accidentPenalties: { "None": 0, "Minor Claim": 20000, "Major Structural": 40000 },
  urgencyDiscounts: { "High": 20000, "Medium": 10000, "Low": 0 },
  ownershipPremiums: { "1st Owner": 10000, "2nd Owner": 0, "3rd Owner": -10000, "4th+ Owner": -20000 },
  expectedKmPerYear: 12000,
  excessKmRate: 1.5,
  listingMarkup: 1.06,
  minimumDiscount: 0.95,
  defaultDemand: "Medium",
  defaultUrgency: "Low",
};

const Admin = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState(0);

  // Valuation tuner state
  const [config, setConfig] = useState(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
  const [testInput, setTestInput] = useState({
    basePrice: 800000,
    year: 2020,
    make: "Maruti Suzuki",
    kmDriven: 40000,
    condition: "Good",
    ownership: "1st Owner",
    accidentType: "None",
  });
  const [testResult, setTestResult] = useState(null);

  const handleLogin = (e) => {
    e.preventDefault();
    if (loginPhone === ADMIN_PHONE && loginPassword === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setLoginError("");
    } else {
      setLoginError("Invalid phone number or password.");
    }
  };

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sell_leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching leads:", error);
    } else {
      setLeads(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchLeads();
    }
  }, [isAuthenticated]);

  const filtered = leads.filter((lead) => {
    const q = search.toLowerCase();
    return (
      (lead.name || "").toLowerCase().includes(q) ||
      (lead.phone || "").toLowerCase().includes(q) ||
      (lead.make || "").toLowerCase().includes(q) ||
      (lead.model || "").toLowerCase().includes(q) ||
      (lead.registration_number || "").toLowerCase().includes(q)
    );
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ===== EXPORT TO EXCEL (CSV) =====
  const exportToExcel = () => {
    if (filtered.length === 0) return;
    const headers = [
      "ID", "Name", "Phone", "Registration No.", "Make", "Model", "Trim",
      "Year", "Fuel Type", "Transmission", "Ownership", "KM Driven",
      "Condition", "Accident Type", "Date",
    ];
    const escapeCSV = (val) => {
      const str = String(val ?? "");
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const rows = filtered.map((lead) => [
      lead.id,
      lead.name,
      lead.phone,
      lead.registration_number,
      lead.make,
      lead.model,
      lead.trim,
      lead.year,
      lead.fuel_type,
      lead.transmission,
      lead.ownership,
      lead.km_driven,
      lead.condition,
      lead.accident_type,
      formatDate(lead.created_at),
    ].map(escapeCSV).join(","));

    const csv = [headers.join(","), ...rows].join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sell_leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===== VALUATION CALCULATOR =====
  const runValuation = () => {
    const { basePrice, year, make, kmDriven, condition, ownership, accidentType } = testInput;
    const currentYear = new Date().getFullYear();
    const carAge = currentYear - parseInt(year);
    const clampedAge = Math.min(Math.max(carAge, 0), 7);
    const depPct = config.ageDepreciation[clampedAge] !== undefined
      ? config.ageDepreciation[clampedAge]
      : config.fallbackDepreciation;
    const depreciatedPrice = basePrice * depPct;

    const demandFactor = config.demandFactors[config.defaultDemand];
    const brandFactor = config.brandFactors[make] || config.brandFactors["Other"];

    const expectedKm = Math.max(carAge, 1) * config.expectedKmPerYear;
    const excessKm = Math.max(0, kmDriven - expectedKm);
    const mileageDeduction = excessKm * config.excessKmRate;

    const conditionAdj = config.conditionAdjustments[condition] || 0;
    const ownershipAdj = config.ownershipPremiums[ownership] || 0;
    const accidentPenalty = config.accidentPenalties[accidentType] || 0;
    const urgencyDiscount = config.urgencyDiscounts[config.defaultUrgency];

    const fairValue = (depreciatedPrice * demandFactor * brandFactor)
      - mileageDeduction + conditionAdj + ownershipAdj - accidentPenalty - urgencyDiscount;

    const listingPrice = fairValue * config.listingMarkup;
    const minPrice = fairValue * config.minimumDiscount;

    const fmt = (v) => Math.max(0, v / 100000).toFixed(2);
    setTestResult({
      fairValue,
      listingPrice,
      minPrice,
      display: `₹${fmt(minPrice)} - ₹${fmt(listingPrice)} Lakhs`,
      breakdown: {
        basePrice,
        depPct: (depPct * 100).toFixed(0) + "%",
        depreciatedPrice,
        demandFactor,
        brandFactor,
        mileageDeduction,
        conditionAdj,
        ownershipAdj,
        accidentPenalty,
        urgencyDiscount,
        fairValue,
      },
    });
  };

  const updateConfig = (section, key, value) => {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (section) {
        next[section][key] = value;
      } else {
        next[key] = value;
      }
      return next;
    });
    setTestResult(null);
  };

  const resetConfig = () => {
    setConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
    setTestResult(null);
  };

  // ===== SUB-COMPONENTS =====
  const MobileCard = ({ lead, index }) => (
    <Card sx={{ mb: 2, borderRadius: "12px", border: "1px solid #e0e0e0", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
          <Typography sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, fontSize: "1.05rem" }}>
            {lead.name || "—"}
          </Typography>
          <Chip label={`#${index + 1}`} size="small" sx={{ backgroundColor: "#00CE84", color: "#fff", fontWeight: 600, fontFamily: "Bricolage Grotesque" }} />
        </Box>
        <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.85rem", color: "#666", mb: 1 }}>
          Tel: {lead.phone || "—"}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1.5 }}>
          {lead.make && <Chip label={lead.make} size="small" sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.75rem" }} />}
          {lead.model && <Chip label={lead.model} size="small" sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.75rem" }} />}
          {lead.year && <Chip label={lead.year} size="small" sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.75rem" }} />}
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, fontSize: "0.8rem" }}>
          <Detail label="Reg No." value={lead.registration_number} />
          <Detail label="Trim" value={lead.trim} />
          <Detail label="Fuel" value={lead.fuel_type} />
          <Detail label="Transmission" value={lead.transmission} />
          <Detail label="Ownership" value={lead.ownership} />
          <Detail label="KM Driven" value={lead.km_driven ? Number(lead.km_driven).toLocaleString("en-IN") : null} />
          <Detail label="Condition" value={lead.condition} />
          <Detail label="Accident" value={lead.accident_type} />
        </Box>
        <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.75rem", color: "#999", mt: 1.5, textAlign: "right" }}>
          {formatDate(lead.created_at)}
        </Typography>
      </CardContent>
    </Card>
  );

  const Detail = ({ label, value }) => (
    <Box>
      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.7rem", color: "#999", lineHeight: 1.2 }}>{label}</Typography>
      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.82rem", fontWeight: 500 }}>{value || "—"}</Typography>
    </Box>
  );

  const SectionTitle = ({ children, icon, color = "#00CE84" }) => (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, mt: 3, "&:first-of-type": { mt: 0 } }}>
      {icon && <Box sx={{ width: 32, height: 32, borderRadius: "8px", backgroundColor: color + "18", display: "flex", alignItems: "center", justifyContent: "center", color, fontSize: "1rem" }}>{icon}</Box>}
      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, fontSize: "1rem", color: "#1a1a1a" }}>
        {children}
      </Typography>
    </Box>
  );

  const ParamRow = ({ label, value, onChange, type = "number", step, min, max, prefix, suffix }) => (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1, gap: 2, py: 0.5, px: 1.5, borderRadius: "8px", "&:hover": { backgroundColor: "#f8f9fa" }, transition: "background 0.15s" }}>
      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.85rem", minWidth: 140, color: "#444" }}>{label}</Typography>
      <TextField
        size="small"
        type={type}
        value={value}
        onChange={(e) => onChange(type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
        inputProps={{ step: step || 0.01, min, max }}
        InputProps={{
          ...(prefix ? { startAdornment: <InputAdornment position="start"><Typography sx={{ fontSize: "0.8rem", color: "#999" }}>{prefix}</Typography></InputAdornment> } : {}),
          ...(suffix ? { endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: "0.8rem", color: "#999" }}>{suffix}</Typography></InputAdornment> } : {}),
        }}
        sx={{
          width: prefix || suffix ? 140 : 120,
          "& .MuiOutlinedInput-root": { borderRadius: "8px", fontFamily: "Bricolage Grotesque", fontSize: "0.85rem", backgroundColor: "#fff" },
        }}
      />
    </Box>
  );

  // ===== LOGIN SCREEN =====
  if (!isAuthenticated) {
    return (
      <Box sx={{ minHeight: "100vh", backgroundColor: "#f8f9fa", display: "flex", alignItems: "center", justifyContent: "center", px: 2 }}>
        <Helmet><title>Admin Login | Lane</title></Helmet>
        <Paper elevation={3} sx={{ p: 4, borderRadius: "16px", maxWidth: 380, width: "100%", textAlign: "center" }}>
          <img src="/LANE_LOGO.svg" alt="Lane logo" width={60} style={{ marginBottom: 16 }} />
          <Typography sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, fontSize: "1.3rem", mb: 3 }}>Admin Login</Typography>
          <form onSubmit={handleLogin}>
            <TextField
              fullWidth label="Phone Number" value={loginPhone}
              onChange={(e) => setLoginPhone(e.target.value)}
              sx={{ mb: 2, "& .MuiOutlinedInput-root": { borderRadius: "10px", fontFamily: "Bricolage Grotesque" }, "& .MuiInputLabel-root": { fontFamily: "Bricolage Grotesque" } }}
            />
            <TextField
              fullWidth label="Password" type="password" value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              sx={{ mb: 2, "& .MuiOutlinedInput-root": { borderRadius: "10px", fontFamily: "Bricolage Grotesque" }, "& .MuiInputLabel-root": { fontFamily: "Bricolage Grotesque" } }}
            />
            {loginError && (
              <Typography sx={{ color: "red", fontSize: "0.85rem", fontFamily: "Bricolage Grotesque", mb: 1.5 }}>{loginError}</Typography>
            )}
            <Button type="submit" fullWidth variant="contained"
              sx={{ backgroundColor: "#00CE84", fontFamily: "Bricolage Grotesque", fontWeight: 600, borderRadius: "10px", py: 1.2, textTransform: "none", fontSize: "1rem", "&:hover": { backgroundColor: "#00b574" } }}>
              Login
            </Button>
          </form>
        </Paper>
      </Box>
    );
  }

  // ===== MAIN DASHBOARD =====
  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#f8f9fa" }}>
      <Helmet><title>Admin - Sell Leads | Lane</title></Helmet>

      {/* Header */}
      <Box sx={{ backgroundColor: "#00CE84", px: isMobile ? 2 : 6, py: 3 }}>
        <Typography sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, fontSize: isMobile ? "1.5rem" : "2rem", color: "#fff" }}>
          Sell Leads Dashboard
        </Typography>
        <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: isMobile ? "0.85rem" : "1rem", color: "rgba(255,255,255,0.85)" }}>
          All car sell enquiries from users
        </Typography>
      </Box>

      {/* Tabs */}
      <Box sx={{ px: isMobile ? 2 : 6, borderBottom: "1px solid #e0e0e0", backgroundColor: "#fff" }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            "& .MuiTab-root": { fontFamily: "Bricolage Grotesque", textTransform: "none", fontWeight: 600 },
            "& .Mui-selected": { color: "#00CE84" },
            "& .MuiTabs-indicator": { backgroundColor: "#00CE84" },
          }}
        >
          <Tab icon={<PeopleIcon />} iconPosition="start" label="Leads" />
          <Tab icon={<TuneIcon />} iconPosition="start" label="Valuation Tuner" />
        </Tabs>
      </Box>

      {/* TAB 0: Leads */}
      {activeTab === 0 && (
        <>
          {/* Controls */}
          <Box sx={{ px: isMobile ? 2 : 6, py: 2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <TextField
              placeholder="Search by name, phone, make, model, reg..."
              size="small" value={search} onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 200, "& .MuiOutlinedInput-root": { borderRadius: "10px", fontFamily: "Bricolage Grotesque" } }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: "#999" }} /></InputAdornment> }}
            />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Chip label={`${filtered.length} leads`} sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 600, backgroundColor: "#e8f5e9", color: "#2e7d32" }} />
              <Button
                variant="outlined" size="small" startIcon={<DownloadIcon />}
                onClick={exportToExcel}
                sx={{ fontFamily: "Bricolage Grotesque", textTransform: "none", borderColor: "#00CE84", color: "#00CE84", borderRadius: "8px", "&:hover": { borderColor: "#00b574", backgroundColor: "#e8f5e9" } }}
              >
                Export CSV
              </Button>
              <IconButton onClick={fetchLeads} sx={{ color: "#00CE84" }}><RefreshIcon /></IconButton>
            </Box>
          </Box>

          {/* Content */}
          <Box sx={{ px: isMobile ? 2 : 6, pb: 4 }}>
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 10 }}>
                <CircularProgress sx={{ color: "#00CE84" }} />
              </Box>
            ) : filtered.length === 0 ? (
              <Box sx={{ textAlign: "center", py: 10 }}>
                <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "1.1rem", color: "#999" }}>
                  {search ? "No leads match your search." : "No leads yet."}
                </Typography>
              </Box>
            ) : isMobile ? (
              filtered.map((lead, i) => <MobileCard key={lead.id || i} lead={lead} index={i} />)
            ) : (
              <TableContainer component={Paper} sx={{ borderRadius: "12px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                      {["#", "Name", "Phone", "Reg No.", "Make", "Model", "Trim", "Year", "Fuel", "Trans.", "Ownership", "KM Driven", "Condition", "Accident", "Date"].map((h) => (
                        <TableCell key={h} sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, fontSize: "0.8rem", color: "#333", whiteSpace: "nowrap" }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filtered.map((lead, i) => (
                      <TableRow key={lead.id || i} sx={{ "&:hover": { backgroundColor: "#f9fdf9" }, "&:nth-of-type(even)": { backgroundColor: "#fafafa" } }}>
                        <TableCell sx={cellSx}>{i + 1}</TableCell>
                        <TableCell sx={{ ...cellSx, fontWeight: 600 }}>{lead.name || "—"}</TableCell>
                        <TableCell sx={cellSx}>{lead.phone || "—"}</TableCell>
                        <TableCell sx={cellSx}>{lead.registration_number || "—"}</TableCell>
                        <TableCell sx={cellSx}>{lead.make || "—"}</TableCell>
                        <TableCell sx={cellSx}>{lead.model || "—"}</TableCell>
                        <TableCell sx={cellSx}>{lead.trim || "—"}</TableCell>
                        <TableCell sx={cellSx}>{lead.year || "—"}</TableCell>
                        <TableCell sx={cellSx}>{lead.fuel_type || "—"}</TableCell>
                        <TableCell sx={cellSx}>{lead.transmission || "—"}</TableCell>
                        <TableCell sx={cellSx}>{lead.ownership || "—"}</TableCell>
                        <TableCell sx={cellSx}>{lead.km_driven ? Number(lead.km_driven).toLocaleString("en-IN") : "—"}</TableCell>
                        <TableCell sx={cellSx}>{lead.condition || "—"}</TableCell>
                        <TableCell sx={cellSx}>{lead.accident_type || "—"}</TableCell>
                        <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>{formatDate(lead.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </>
      )}

      {/* TAB 1: Valuation Tuner */}
      {activeTab === 1 && (
        <Box sx={{ px: isMobile ? 2 : 6, py: 3 }}>
          {/* Hero Banner */}
          <Paper sx={{
            p: isMobile ? 2.5 : 3.5, borderRadius: "16px", mb: 3,
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
            color: "#fff", position: "relative", overflow: "hidden",
          }}>
            <Box sx={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(0,206,132,0.08)" }} />
            <Box sx={{ position: "absolute", bottom: -60, right: 80, width: 150, height: 150, borderRadius: "50%", background: "rgba(0,206,132,0.05)" }} />
            <Box sx={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
              <Box>
                <Typography sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: isMobile ? "1.4rem" : "1.8rem", mb: 0.5 }}>
                  Valuation Algorithm Tuner
                </Typography>
                <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.9rem", opacity: 0.7 }}>
                  Adjust multipliers, test valuations live, and fine-tune your pricing engine
                </Typography>
              </Box>
              <Button size="small" onClick={resetConfig} variant="outlined"
                sx={{ fontFamily: "Bricolage Grotesque", textTransform: "none", borderColor: "rgba(255,255,255,0.3)", color: "#fff", borderRadius: "10px", px: 2, "&:hover": { borderColor: "#00CE84", backgroundColor: "rgba(0,206,132,0.1)" } }}>
                Reset All to Default
              </Button>
            </Box>
          </Paper>

          <Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 3 }}>
            {/* LEFT: Config Panels */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>

              {/* Age Depreciation */}
              <Paper sx={{ p: 2.5, borderRadius: "14px", border: "1px solid #eee" }}>
                <SectionTitle icon="📉" color="#e74c3c">Age Depreciation</SectionTitle>
                <Box sx={{ backgroundColor: "#fafafa", borderRadius: "10px", p: 2 }}>
                  {Object.keys(config.ageDepreciation).map((age) => (
                    <Box key={age} sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
                      <Chip label={`${age}y`} size="small" sx={{
                        fontFamily: "Bricolage Grotesque", fontWeight: 600, fontSize: "0.75rem", minWidth: 36,
                        backgroundColor: config.ageDepreciation[age] > 0.7 ? "#e8f5e9" : config.ageDepreciation[age] > 0.5 ? "#fff3e0" : "#ffebee",
                        color: config.ageDepreciation[age] > 0.7 ? "#2e7d32" : config.ageDepreciation[age] > 0.5 ? "#e65100" : "#c62828",
                      }} />
                      <Slider
                        size="small" min={0} max={1} step={0.01}
                        value={config.ageDepreciation[age]}
                        onChange={(_, v) => updateConfig("ageDepreciation", age, v)}
                        sx={{
                          flex: 1,
                          color: config.ageDepreciation[age] > 0.7 ? "#00CE84" : config.ageDepreciation[age] > 0.5 ? "#ff9800" : "#e74c3c",
                          "& .MuiSlider-thumb": { width: 16, height: 16, boxShadow: "0 2px 6px rgba(0,0,0,0.15)" },
                        }}
                      />
                      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.85rem", fontWeight: 700, width: 45, textAlign: "right", color: "#333" }}>
                        {(config.ageDepreciation[age] * 100).toFixed(0)}%
                      </Typography>
                    </Box>
                  ))}
                  <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px dashed #ddd" }}>
                    <ParamRow label="7+ years fallback" value={config.fallbackDepreciation} onChange={(v) => updateConfig(null, "fallbackDepreciation", v)} step={0.01} suffix="x" />
                  </Box>
                </Box>
              </Paper>

              {/* Mileage & Pricing */}
              <Paper sx={{ p: 2.5, borderRadius: "14px", border: "1px solid #eee" }}>
                <SectionTitle icon="🛣️" color="#3498db">Mileage & Pricing</SectionTitle>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                  <Box sx={{ backgroundColor: "#f0f7ff", borderRadius: "10px", p: 2 }}>
                    <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.7rem", color: "#666", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}>Expected KM/Year</Typography>
                    <TextField size="small" type="number" fullWidth value={config.expectedKmPerYear}
                      onChange={(e) => updateConfig(null, "expectedKmPerYear", parseFloat(e.target.value) || 0)}
                      inputProps={{ step: 1000 }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px", fontFamily: "Bricolage Grotesque", fontSize: "0.9rem", fontWeight: 600, backgroundColor: "#fff" } }}
                    />
                  </Box>
                  <Box sx={{ backgroundColor: "#f0f7ff", borderRadius: "10px", p: 2 }}>
                    <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.7rem", color: "#666", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}>Excess KM Rate</Typography>
                    <TextField size="small" type="number" fullWidth value={config.excessKmRate}
                      onChange={(e) => updateConfig(null, "excessKmRate", parseFloat(e.target.value) || 0)}
                      inputProps={{ step: 0.1 }}
                      InputProps={{ startAdornment: <InputAdornment position="start"><Typography sx={{ fontSize: "0.8rem", color: "#999" }}>₹</Typography></InputAdornment> }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px", fontFamily: "Bricolage Grotesque", fontSize: "0.9rem", fontWeight: 600, backgroundColor: "#fff" } }}
                    />
                  </Box>
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 1 }}>
                  <Box sx={{ backgroundColor: "#f5f0ff", borderRadius: "10px", p: 2 }}>
                    <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.7rem", color: "#666", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}>Listing Markup</Typography>
                    <TextField size="small" type="number" fullWidth value={config.listingMarkup}
                      onChange={(e) => updateConfig(null, "listingMarkup", parseFloat(e.target.value) || 0)}
                      inputProps={{ step: 0.01 }}
                      InputProps={{ endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: "0.8rem", color: "#999" }}>x</Typography></InputAdornment> }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px", fontFamily: "Bricolage Grotesque", fontSize: "0.9rem", fontWeight: 600, backgroundColor: "#fff" } }}
                    />
                  </Box>
                  <Box sx={{ backgroundColor: "#f5f0ff", borderRadius: "10px", p: 2 }}>
                    <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.7rem", color: "#666", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}>Min Price Factor</Typography>
                    <TextField size="small" type="number" fullWidth value={config.minimumDiscount}
                      onChange={(e) => updateConfig(null, "minimumDiscount", parseFloat(e.target.value) || 0)}
                      inputProps={{ step: 0.01 }}
                      InputProps={{ endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: "0.8rem", color: "#999" }}>x</Typography></InputAdornment> }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px", fontFamily: "Bricolage Grotesque", fontSize: "0.9rem", fontWeight: 600, backgroundColor: "#fff" } }}
                    />
                  </Box>
                </Box>
              </Paper>

              {/* Demand Factor */}
              <Paper sx={{ p: 2.5, borderRadius: "14px", border: "1px solid #eee" }}>
                <SectionTitle icon="📊" color="#9b59b6">Demand Factors</SectionTitle>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
                  {Object.keys(config.demandFactors).map((k) => (
                    <Box key={k} sx={{ backgroundColor: k === "High" ? "#e8f5e9" : k === "Medium" ? "#fff8e1" : "#ffebee", borderRadius: "10px", p: 1.5, textAlign: "center" }}>
                      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.72rem", color: "#666", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}>{k}</Typography>
                      <TextField size="small" type="number" value={config.demandFactors[k]}
                        onChange={(e) => updateConfig("demandFactors", k, parseFloat(e.target.value) || 0)}
                        inputProps={{ step: 0.01 }}
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px", fontFamily: "Bricolage Grotesque", fontSize: "0.9rem", fontWeight: 700, backgroundColor: "#fff", "& input": { textAlign: "center" } } }}
                      />
                    </Box>
                  ))}
                </Box>
              </Paper>

              {/* Condition / Ownership / Accident in a grid */}
              <Paper sx={{ p: 2.5, borderRadius: "14px", border: "1px solid #eee" }}>
                <SectionTitle icon="🔧" color="#e67e22">Adjustments & Penalties</SectionTitle>

                <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.78rem", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, mb: 1 }}>Condition</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mb: 2 }}>
                  {Object.keys(config.conditionAdjustments).map((k) => (
                    <Box key={k} sx={{ backgroundColor: config.conditionAdjustments[k] >= 0 ? "#f0faf5" : "#fff5f5", borderRadius: "8px", p: 1.5 }}>
                      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.72rem", color: "#888", mb: 0.3 }}>{k}</Typography>
                      <TextField size="small" type="number" fullWidth value={config.conditionAdjustments[k]}
                        onChange={(e) => updateConfig("conditionAdjustments", k, parseFloat(e.target.value) || 0)}
                        inputProps={{ step: 5000 }}
                        InputProps={{ startAdornment: <InputAdornment position="start"><Typography sx={{ fontSize: "0.75rem", color: "#999" }}>₹</Typography></InputAdornment> }}
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px", fontFamily: "Bricolage Grotesque", fontSize: "0.85rem", fontWeight: 600, backgroundColor: "#fff" } }}
                      />
                    </Box>
                  ))}
                </Box>

                <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.78rem", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, mb: 1 }}>Ownership</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mb: 2 }}>
                  {Object.keys(config.ownershipPremiums).map((k) => (
                    <Box key={k} sx={{ backgroundColor: config.ownershipPremiums[k] >= 0 ? "#f0faf5" : "#fff5f5", borderRadius: "8px", p: 1.5 }}>
                      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.72rem", color: "#888", mb: 0.3 }}>{k}</Typography>
                      <TextField size="small" type="number" fullWidth value={config.ownershipPremiums[k]}
                        onChange={(e) => updateConfig("ownershipPremiums", k, parseFloat(e.target.value) || 0)}
                        inputProps={{ step: 5000 }}
                        InputProps={{ startAdornment: <InputAdornment position="start"><Typography sx={{ fontSize: "0.75rem", color: "#999" }}>₹</Typography></InputAdornment> }}
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px", fontFamily: "Bricolage Grotesque", fontSize: "0.85rem", fontWeight: 600, backgroundColor: "#fff" } }}
                      />
                    </Box>
                  ))}
                </Box>

                <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.78rem", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, mb: 1 }}>Accident Penalties</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
                  {Object.keys(config.accidentPenalties).map((k) => (
                    <Box key={k} sx={{ backgroundColor: config.accidentPenalties[k] === 0 ? "#f0faf5" : "#fff5f5", borderRadius: "8px", p: 1.5 }}>
                      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.72rem", color: "#888", mb: 0.3 }}>{k}</Typography>
                      <TextField size="small" type="number" fullWidth value={config.accidentPenalties[k]}
                        onChange={(e) => updateConfig("accidentPenalties", k, parseFloat(e.target.value) || 0)}
                        inputProps={{ step: 5000 }}
                        InputProps={{ startAdornment: <InputAdornment position="start"><Typography sx={{ fontSize: "0.75rem", color: "#999" }}>₹</Typography></InputAdornment> }}
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px", fontFamily: "Bricolage Grotesque", fontSize: "0.85rem", fontWeight: 600, backgroundColor: "#fff" } }}
                      />
                    </Box>
                  ))}
                </Box>
              </Paper>

              {/* Brand Factors */}
              <Paper sx={{ p: 2.5, borderRadius: "14px", border: "1px solid #eee" }}>
                <SectionTitle icon="🏷️" color="#2980b9">Brand Factors</SectionTitle>
                <Box sx={{ maxHeight: 400, overflowY: "auto", pr: 0.5, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.5 }}>
                  {Object.keys(config.brandFactors).map((brand) => (
                    <Box key={brand} sx={{
                      display: "flex", alignItems: "center", gap: 1, py: 0.8, px: 1.5, borderRadius: "8px",
                      backgroundColor: config.brandFactors[brand] >= 1.0 ? "#f0faf5" : "#fafafa",
                      "&:hover": { backgroundColor: config.brandFactors[brand] >= 1.0 ? "#e0f5ec" : "#f0f0f0" },
                      transition: "background 0.15s",
                    }}>
                      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.78rem", flex: 1, color: "#444" }}>{brand}</Typography>
                      <TextField size="small" type="number" value={config.brandFactors[brand]}
                        onChange={(e) => updateConfig("brandFactors", brand, parseFloat(e.target.value) || 0)}
                        inputProps={{ step: 0.01 }}
                        sx={{ width: 80, "& .MuiOutlinedInput-root": { borderRadius: "6px", fontFamily: "Bricolage Grotesque", fontSize: "0.8rem", fontWeight: 600, backgroundColor: "#fff", "& input": { textAlign: "center", py: 0.5, px: 1 } } }}
                      />
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Box>

            {/* RIGHT: Test Panel */}
            <Box>
              <Paper sx={{
                borderRadius: "16px", border: "1px solid #eee", position: "sticky", top: 20, overflow: "hidden",
              }}>
                {/* Test panel header */}
                <Box sx={{ background: "linear-gradient(135deg, #00CE84, #00a86b)", p: 2.5, color: "#fff" }}>
                  <Typography sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, fontSize: "1.1rem" }}>
                    Test Valuation
                  </Typography>
                  <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.8rem", opacity: 0.8 }}>
                    Enter car details to see real-time pricing
                  </Typography>
                </Box>

                <Box sx={{ p: 2.5 }}>
                  {/* Base Price */}
                  <Box sx={{ mb: 2 }}>
                    <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.75rem", color: "#888", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}>Base Price</Typography>
                    <TextField size="small" type="number" fullWidth value={testInput.basePrice}
                      onChange={(e) => setTestInput((p) => ({ ...p, basePrice: parseFloat(e.target.value) || 0 }))}
                      inputProps={{ step: 50000 }}
                      InputProps={{ startAdornment: <InputAdornment position="start"><Typography sx={{ fontSize: "0.85rem", color: "#999" }}>₹</Typography></InputAdornment> }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px", fontFamily: "Bricolage Grotesque", fontSize: "1rem", fontWeight: 600 } }}
                    />
                  </Box>

                  {/* Year & Make */}
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2 }}>
                    <Box>
                      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.75rem", color: "#888", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}>Year</Typography>
                      <TextField size="small" type="number" fullWidth value={testInput.year}
                        onChange={(e) => setTestInput((p) => ({ ...p, year: parseInt(e.target.value) || 2020 }))}
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px", fontFamily: "Bricolage Grotesque", fontSize: "0.9rem", fontWeight: 600 } }}
                      />
                    </Box>
                    <Box>
                      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.75rem", color: "#888", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}>KM Driven</Typography>
                      <TextField size="small" type="number" fullWidth value={testInput.kmDriven}
                        onChange={(e) => setTestInput((p) => ({ ...p, kmDriven: parseFloat(e.target.value) || 0 }))}
                        inputProps={{ step: 5000 }}
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px", fontFamily: "Bricolage Grotesque", fontSize: "0.9rem", fontWeight: 600 } }}
                      />
                    </Box>
                  </Box>

                  {/* Make */}
                  <Box sx={{ mb: 2 }}>
                    <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.75rem", color: "#888", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}>Make</Typography>
                    <FormControl size="small" fullWidth>
                      <Select value={testInput.make} onChange={(e) => setTestInput((p) => ({ ...p, make: e.target.value }))}
                        sx={{ borderRadius: "10px", fontFamily: "Bricolage Grotesque", fontSize: "0.9rem", fontWeight: 600 }}>
                        {Object.keys(config.brandFactors).map((b) => <MenuItem key={b} value={b} sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.85rem" }}>{b}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Box>

                  {/* Condition, Ownership, Accident */}
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, mb: 2.5 }}>
                    <Box>
                      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.7rem", color: "#888", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}>Condition</Typography>
                      <FormControl size="small" fullWidth>
                        <Select value={testInput.condition} onChange={(e) => setTestInput((p) => ({ ...p, condition: e.target.value }))}
                          sx={{ borderRadius: "10px", fontFamily: "Bricolage Grotesque", fontSize: "0.8rem" }}>
                          {Object.keys(config.conditionAdjustments).map((c) => <MenuItem key={c} value={c} sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.8rem" }}>{c}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Box>
                    <Box>
                      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.7rem", color: "#888", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}>Ownership</Typography>
                      <FormControl size="small" fullWidth>
                        <Select value={testInput.ownership} onChange={(e) => setTestInput((p) => ({ ...p, ownership: e.target.value }))}
                          sx={{ borderRadius: "10px", fontFamily: "Bricolage Grotesque", fontSize: "0.8rem" }}>
                          {Object.keys(config.ownershipPremiums).map((o) => <MenuItem key={o} value={o} sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.8rem" }}>{o}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Box>
                    <Box>
                      <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.7rem", color: "#888", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}>Accident</Typography>
                      <FormControl size="small" fullWidth>
                        <Select value={testInput.accidentType} onChange={(e) => setTestInput((p) => ({ ...p, accidentType: e.target.value }))}
                          sx={{ borderRadius: "10px", fontFamily: "Bricolage Grotesque", fontSize: "0.8rem" }}>
                          {Object.keys(config.accidentPenalties).map((a) => <MenuItem key={a} value={a} sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.8rem" }}>{a}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Box>
                  </Box>

                  <Button fullWidth variant="contained" onClick={runValuation}
                    sx={{
                      background: "linear-gradient(135deg, #00CE84, #00a86b)",
                      fontFamily: "Bricolage Grotesque", fontWeight: 700, borderRadius: "12px", py: 1.5, textTransform: "none", fontSize: "1rem",
                      boxShadow: "0 4px 15px rgba(0,206,132,0.3)",
                      "&:hover": { boxShadow: "0 6px 20px rgba(0,206,132,0.4)" },
                    }}>
                    Calculate Valuation
                  </Button>

                  {/* Results */}
                  {testResult && (
                    <Box sx={{ mt: 2.5 }}>
                      {/* Price Display */}
                      <Box sx={{
                        background: "linear-gradient(135deg, #f0faf5, #e8f5e9)", borderRadius: "14px", p: 2.5, mb: 2,
                        border: "1px solid #c8e6c9", textAlign: "center",
                      }}>
                        <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.75rem", color: "#666", textTransform: "uppercase", letterSpacing: 1, mb: 0.5 }}>
                          Estimated Price Range
                        </Typography>
                        <Typography sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: "1.6rem", color: "#00CE84" }}>
                          {testResult.display}
                        </Typography>
                      </Box>

                      {/* Breakdown */}
                      <Box sx={{ backgroundColor: "#fafafa", borderRadius: "12px", p: 2, border: "1px solid #eee" }}>
                        <Typography sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, fontSize: "0.85rem", mb: 1.5, color: "#333" }}>
                          Calculation Breakdown
                        </Typography>
                        {Object.entries(testResult.breakdown).map(([key, val]) => {
                          const isNegative = typeof val === "number" && val < 0;
                          const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
                          return (
                            <Box key={key} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 0.6, px: 1, borderRadius: "6px", "&:hover": { backgroundColor: "#f0f0f0" } }}>
                              <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.8rem", color: "#666" }}>{label}</Typography>
                              <Typography sx={{
                                fontFamily: "Bricolage Grotesque", fontSize: "0.82rem", fontWeight: 700,
                                color: isNegative ? "#e74c3c" : typeof val === "number" && val > 100 ? "#333" : "#666",
                              }}>
                                {typeof val === "number" ? (Math.abs(val) > 100 ? `${isNegative ? "-" : ""}₹${Math.abs(val).toLocaleString("en-IN")}` : val.toFixed(2)) : val}
                              </Typography>
                            </Box>
                          );
                        })}
                        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "2px solid #00CE84", display: "flex", justifyContent: "space-between", alignItems: "center", px: 1 }}>
                          <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "0.85rem", fontWeight: 700, color: "#333" }}>Fair Value</Typography>
                          <Typography sx={{ fontFamily: "Bricolage Grotesque", fontSize: "1rem", fontWeight: 800, color: "#00CE84" }}>
                            ₹{Math.max(0, testResult.fairValue).toLocaleString("en-IN")}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  )}
                </Box>
              </Paper>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};

const cellSx = {
  fontFamily: "Bricolage Grotesque",
  fontSize: "0.82rem",
  py: 1.2,
};

export default Admin;
