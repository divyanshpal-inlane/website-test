import React, { useState, useCallback, memo } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import {
  Box,
  TextField,
  Button,
  FormControl,
  Select,
  MenuItem,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import Navbar2 from "../components/Navbar";
import Footer from "../components/Footer";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { supabase } from "../supabaseClient";
import TagManager from "react-gtm-module";

// Car makes data
const carMakes = [
  "Maruti Suzuki",
  "Hyundai",
  "Tata",
  "Mahindra",
  "Honda",
  "Toyota",
  "Kia",
  "MG",
  "Volkswagen",
  "Skoda",
  "Renault",
  "Nissan",
  "Ford",
  "Jeep",
  "BMW",
  "Mercedes-Benz",
  "Audi",
  "Volvo",
  "Land Rover",
  "Jaguar",
  "Mini",
  "Porsche",
  "Lexus",
  "Isuzu",
  "Citroen",
  "BYD",
  "Datsun",
  "Fiat",
  "Mitsubishi",
  "Chevrolet",
  "Other",
];

// Car models mapping - expanded with more market-available models
const carModels = {
  "Maruti Suzuki": [
    "Swift",
    "Baleno",
    "Wagon R",
    "Alto",
    "Alto K10",
    "Dzire",
    "Ertiga",
    "Brezza",
    "Fronx",
    "Grand Vitara",
    "Jimny",
    "Celerio",
    "Ignis",
    "Ciaz",
    "S-Presso",
    "XL6",
    "Eeco",
    "S-Cross",
    "Vitara Brezza",
    "Zen Estilo",
    "Ritz",
    "A-Star",
    "Other",
  ],
  Hyundai: [
    "Creta",
    "Venue",
    "i20",
    "Grand i10 Nios",
    "Verna",
    "Aura",
    "Tucson",
    "Alcazar",
    "Exter",
    "Santro",
    "i10",
    "Elite i20",
    "Xcent",
    "Eon",
    "Grand i10",
    "Kona Electric",
    "ix25",
    "Other",
  ],
  Tata: [
    "Nexon",
    "Punch",
    "Harrier",
    "Safari",
    "Altroz",
    "Tiago",
    "Tigor",
    "Nexon EV",
    "Tiago EV",
    "Curvv",
    "Hexa",
    "Bolt",
    "Zest",
    "Nano",
    "Indica",
    "Indigo",
    "Sumo",
    "Other",
  ],
  Mahindra: [
    "Scorpio",
    "Scorpio-N",
    "XUV700",
    "XUV300",
    "Thar",
    "Bolero",
    "Marazzo",
    "XUV400",
    "Bolero Neo",
    "KUV100",
    "TUV300",
    "Xylo",
    "Verito",
    "XUV500",
    "Alturas G4",
    "Other",
  ],
  Honda: [
    "City",
    "Amaze",
    "Elevate",
    "Jazz",
    "WR-V",
    "City Hybrid",
    "Civic",
    "BR-V",
    "Brio",
    "Mobilio",
    "CR-V",
    "Other",
  ],
  Toyota: [
    "Innova Crysta",
    "Innova Hycross",
    "Fortuner",
    "Glanza",
    "Urban Cruiser Hyryder",
    "Hilux",
    "Etios",
    "Etios Liva",
    "Camry",
    "Yaris",
    "Corolla Altis",
    "Land Cruiser",
    "Vellfire",
    "Other",
  ],
  Kia: ["Seltos", "Sonet", "Carens", "EV6", "Carnival", "EV9", "Other"],
  MG: [
    "Hector",
    "Hector Plus",
    "Astor",
    "Gloster",
    "Comet EV",
    "ZS EV",
    "Other",
  ],
  Volkswagen: [
    "Polo",
    "Vento",
    "Taigun",
    "Virtus",
    "Tiguan",
    "Tiguan AllSpace",
    "Jetta",
    "Passat",
    "Ameo",
    "Other",
  ],
  Skoda: [
    "Slavia",
    "Kushaq",
    "Rapid",
    "Octavia",
    "Superb",
    "Kodiaq",
    "Karoq",
    "Fabia",
    "Other",
  ],
  Renault: [
    "Kwid",
    "Triber",
    "Kiger",
    "Duster",
    "Captur",
    "Lodgy",
    "Scala",
    "Other",
  ],
  Nissan: ["Magnite", "Sunny", "Micra", "Kicks", "Terrano", "Other"],
  Ford: [
    "EcoSport",
    "Endeavour",
    "Figo",
    "Aspire",
    "Freestyle",
    "Fiesta",
    "Ikon",
    "Other",
  ],
  Jeep: ["Compass", "Meridian", "Wrangler", "Grand Cherokee", "Other"],
  BMW: [
    "3 Series",
    "5 Series",
    "7 Series",
    "X1",
    "X3",
    "X5",
    "X7",
    "2 Series Gran Coupe",
    "6 Series GT",
    "M340i",
    "iX1",
    "i4",
    "Other",
  ],
  "Mercedes-Benz": [
    "C-Class",
    "E-Class",
    "GLC",
    "GLE",
    "S-Class",
    "A-Class Limousine",
    "GLA",
    "GLB",
    "GLS",
    "CLA",
    "EQS",
    "EQB",
    "Other",
  ],
  Audi: [
    "A4",
    "A6",
    "A8",
    "Q3",
    "Q5",
    "Q7",
    "Q8",
    "A3",
    "e-tron",
    "RS5",
    "Other",
  ],
  Volvo: ["XC40", "XC60", "XC90", "S60", "S90", "C40 Recharge", "Other"],
  "Land Rover": [
    "Range Rover Evoque",
    "Range Rover Sport",
    "Range Rover Velar",
    "Defender",
    "Discovery Sport",
    "Range Rover",
    "Other",
  ],
  Jaguar: ["F-Pace", "XE", "XF", "I-Pace", "Other"],
  Mini: ["Cooper", "Countryman", "Clubman", "Other"],
  Porsche: ["Cayenne", "Macan", "911", "Taycan", "Panamera", "Other"],
  Lexus: ["ES", "NX", "RX", "LS", "LX", "LC", "Other"],
  Isuzu: ["D-Max V-Cross", "mu-X", "Other"],
  Citroen: ["C3", "C3 Aircross", "C5 Aircross", "eC3", "Other"],
  BYD: ["Atto 3", "Seal", "e6", "Other"],
  Datsun: ["GO", "GO Plus", "redi-GO", "Other"],
  Fiat: ["Punto", "Linea", "Avventura", "Urban Cross", "Other"],
  Mitsubishi: ["Outlander", "Pajero Sport", "Other"],
  Chevrolet: ["Beat", "Cruze", "Enjoy", "Spark", "Tavera", "Sail", "Other"],
  Other: ["Other"],
};

// Trim levels mapping - base prices in INR (ex-showroom approx) for valuation
// Format: { trimName: basePrice }
const carTrims = {
  // Maruti Suzuki
  Swift: {
    LXi: 599000,
    VXi: 699000,
    "VXi (O)": 729000,
    ZXi: 799000,
    "ZXi+": 899000,
    "ZXi+ Dual Tone": 919000,
    Other: 749000,
  },
  Baleno: {
    Sigma: 649000,
    Delta: 749000,
    Zeta: 849000,
    Alpha: 949000,
    "Alpha Dual Tone": 969000,
    Other: 799000,
  },
  "Wagon R": {
    LXi: 549000,
    VXi: 599000,
    ZXi: 649000,
    "ZXi+": 699000,
    Other: 624000,
  },
  Alto: {
    Std: 349000,
    LXi: 399000,
    VXi: 449000,
    "VXi+": 499000,
    Other: 424000,
  },
  "Alto K10": {
    Std: 399000,
    LXi: 449000,
    VXi: 499000,
    "VXi+": 549000,
    Other: 474000,
  },
  Dzire: {
    LXi: 649000,
    VXi: 749000,
    ZXi: 849000,
    "ZXi+": 949000,
    Other: 799000,
  },
  Ertiga: {
    LXi: 849000,
    VXi: 949000,
    ZXi: 1049000,
    "ZXi+": 1149000,
    Other: 999000,
  },
  Brezza: {
    LXi: 849000,
    VXi: 949000,
    ZXi: 1099000,
    "ZXi+": 1249000,
    Other: 1049000,
  },
  Fronx: {
    Sigma: 749000,
    Delta: 849000,
    "Delta+": 899000,
    Zeta: 999000,
    Alpha: 1099000,
    "Alpha Dual Tone": 1149000,
    Other: 949000,
  },
  "Grand Vitara": {
    Sigma: 1099000,
    Delta: 1249000,
    Zeta: 1399000,
    Alpha: 1549000,
    "Alpha+": 1699000,
    Other: 1399000,
  },
  Jimny: { Zeta: 1274000, Alpha: 1399000, Other: 1349000 },
  Celerio: {
    LXi: 499000,
    VXi: 549000,
    ZXi: 599000,
    "ZXi+": 649000,
    Other: 574000,
  },
  Ignis: {
    Sigma: 549000,
    Delta: 619000,
    Zeta: 699000,
    Alpha: 779000,
    Other: 649000,
  },
  Ciaz: {
    Sigma: 899000,
    Delta: 999000,
    Zeta: 1049000,
    Alpha: 1099000,
    Other: 999000,
  },
  "S-Presso": {
    Std: 399000,
    LXi: 449000,
    VXi: 499000,
    "VXi+": 549000,
    Other: 474000,
  },
  XL6: { Zeta: 1149000, Alpha: 1249000, "Alpha+": 1349000, Other: 1249000 },
  // Hyundai
  Creta: {
    E: 1099000,
    EX: 1199000,
    S: 1349000,
    "S (O)": 1449000,
    SX: 1599000,
    "SX (O)": 1799000,
    "SX Tech": 1999000,
    Other: 1449000,
  },
  Venue: {
    E: 799000,
    S: 899000,
    "S (O)": 949000,
    "S+": 999000,
    SX: 1099000,
    "SX (O)": 1199000,
    Other: 999000,
  },
  i20: {
    Magna: 749000,
    Sportz: 849000,
    Asta: 999000,
    "Asta (O)": 1099000,
    Other: 899000,
  },
  "Grand i10 Nios": {
    Era: 549000,
    Magna: 649000,
    Sportz: 699000,
    Asta: 749000,
    Other: 649000,
  },
  Verna: {
    EX: 1099000,
    S: 1199000,
    SX: 1399000,
    "SX (O)": 1599000,
    "SX Tech": 1799000,
    Other: 1399000,
  },
  Aura: { E: 649000, S: 749000, SX: 849000, "SX+": 949000, Other: 799000 },
  Tucson: { GL: 2799000, GLS: 3199000, Signature: 3499000, Other: 3199000 },
  Alcazar: {
    Prestige: 1699000,
    Platinum: 1899000,
    Signature: 2099000,
    Other: 1899000,
  },
  Exter: {
    EX: 599000,
    S: 699000,
    SX: 799000,
    "SX (O)": 899000,
    "SX Connect": 999000,
    Other: 799000,
  },
  Santro: {
    Era: 449000,
    Magna: 499000,
    Sportz: 549000,
    Asta: 599000,
    Other: 524000,
  },
  // Tata
  Nexon: {
    Smart: 799000,
    "Smart+": 899000,
    Pure: 999000,
    "Pure S": 1049000,
    Creative: 1199000,
    "Creative+": 1349000,
    Fearless: 1449000,
    "Fearless+": 1549000,
    Other: 1149000,
  },
  Punch: {
    Pure: 599000,
    Adventure: 699000,
    Accomplished: 799000,
    Creative: 899000,
    Other: 749000,
  },
  Harrier: {
    Smart: 1499000,
    Pure: 1699000,
    Adventure: 1899000,
    Fearless: 2099000,
    "Fearless+": 2499000,
    Other: 1899000,
  },
  Safari: {
    Smart: 1599000,
    Pure: 1799000,
    Adventure: 1999000,
    Accomplished: 2199000,
    Fearless: 2499000,
    Other: 1999000,
  },
  Altroz: {
    XE: 649000,
    XM: 749000,
    "XM+": 849000,
    XZ: 949000,
    "XZ+": 1049000,
    Other: 849000,
  },
  Tiago: {
    XE: 499000,
    XM: 549000,
    XT: 599000,
    XZ: 649000,
    "XZ+": 699000,
    Other: 599000,
  },
  Tigor: { XE: 599000, XM: 649000, XZ: 699000, "XZ+": 749000, Other: 674000 },
  // Mahindra
  Scorpio: {
    S3: 999000,
    S5: 1099000,
    S7: 1299000,
    S9: 1449000,
    S11: 1599000,
    Other: 1299000,
  },
  "Scorpio-N": {
    Z4: 1399000,
    Z6: 1599000,
    Z8: 1899000,
    "Z8 L": 2199000,
    Other: 1799000,
  },
  XUV700: {
    MX: 1399000,
    AX3: 1549000,
    AX5: 1799000,
    AX7: 1999000,
    "AX7 L": 2499000,
    Other: 1849000,
  },
  XUV300: {
    W4: 799000,
    W6: 949000,
    W8: 1099000,
    "W8 (O)": 1249000,
    Other: 999000,
  },
  Thar: {
    "AX Std": 999000,
    "AX (O)": 1249000,
    LX: 1399000,
    "LX Hard Top": 1549000,
    Other: 1299000,
  },
  Bolero: { B4: 899000, B6: 999000, "B6 (O)": 1049000, Other: 999000 },
  // Honda
  City: { V: 1199000, VX: 1349000, ZX: 1499000, Other: 1349000 },
  Amaze: { E: 749000, S: 849000, VX: 949000, Other: 849000 },
  Elevate: {
    SV: 1099000,
    V: 1249000,
    VX: 1399000,
    ZX: 1549000,
    Other: 1349000,
  },
  // Toyota
  "Innova Crysta": { GX: 1999000, VX: 2349000, ZX: 2699000, Other: 2349000 },
  "Innova Hycross": {
    G: 1999000,
    GX: 2249000,
    VX: 2649000,
    ZX: 2899000,
    "ZX (O)": 3099000,
    Other: 2549000,
  },
  Fortuner: {
    "4x2 MT": 3299000,
    "4x2 AT": 3599000,
    "4x4 MT": 3799000,
    "4x4 AT": 3999000,
    Legender: 4199000,
    Other: 3699000,
  },
  Glanza: { E: 649000, S: 749000, G: 849000, V: 949000, Other: 799000 },
  "Urban Cruiser Hyryder": {
    E: 1099000,
    S: 1249000,
    G: 1399000,
    V: 1549000,
    Other: 1349000,
  },
  // Kia
  Seltos: {
    HTE: 1099000,
    HTK: 1199000,
    "HTK+": 1399000,
    HTX: 1549000,
    "HTX+": 1699000,
    GTX: 1799000,
    "GTX+": 1949000,
    "X-Line": 1999000,
    Other: 1499000,
  },
  Sonet: {
    HTE: 799000,
    HTK: 899000,
    "HTK+": 999000,
    HTX: 1099000,
    "HTX+": 1199000,
    "GTX+": 1399000,
    Other: 1049000,
  },
  Carens: {
    Premium: 1099000,
    Prestige: 1299000,
    "Prestige Plus": 1449000,
    Luxury: 1599000,
    "Luxury Plus": 1799000,
    Other: 1399000,
  },
  // MG
  Hector: {
    Style: 1449000,
    Super: 1649000,
    Smart: 1849000,
    Sharp: 2049000,
    Savvy: 2249000,
    Other: 1849000,
  },
  Astor: {
    Style: 1099000,
    Super: 1249000,
    Smart: 1399000,
    Sharp: 1549000,
    Other: 1349000,
  },
  // Volkswagen
  Polo: {
    Trendline: 649000,
    Comfortline: 749000,
    Highline: 849000,
    "Highline+": 949000,
    "GT TSI": 1049000,
    Other: 849000,
  },
  Vento: {
    Trendline: 949000,
    Comfortline: 1049000,
    Highline: 1149000,
    "Highline+": 1249000,
    Other: 1099000,
  },
  Taigun: {
    Comfortline: 1149000,
    Highline: 1349000,
    Topline: 1549000,
    GT: 1749000,
    "GT Edge": 1849000,
    Other: 1449000,
  },
  Virtus: {
    Comfortline: 1149000,
    Highline: 1349000,
    Topline: 1549000,
    GT: 1749000,
    "GT Edge": 1849000,
    Other: 1449000,
  },
  // Skoda
  Slavia: {
    Active: 1099000,
    Ambition: 1299000,
    Style: 1549000,
    "Style AT": 1699000,
    Other: 1399000,
  },
  Kushaq: {
    Active: 1149000,
    Ambition: 1349000,
    Style: 1549000,
    "Style AT": 1699000,
    "Monte Carlo": 1799000,
    Other: 1449000,
  },
  Rapid: {
    Rider: 849000,
    Ambition: 999000,
    Onyx: 1049000,
    Style: 1149000,
    "Monte Carlo": 1199000,
    Other: 1049000,
  },
  Octavia: { Style: 2599000, "L&K": 2899000, RS: 3299000, Other: 2799000 },
  // Renault
  Kwid: {
    RXE: 449000,
    RXL: 499000,
    RXT: 549000,
    Climber: 599000,
    Other: 524000,
  },
  Triber: { RXE: 599000, RXL: 649000, RXT: 749000, RXZ: 849000, Other: 724000 },
  Kiger: { RXE: 599000, RXL: 699000, RXT: 799000, RXZ: 899000, Other: 749000 },
  // BMW
  "3 Series": {
    "320d Sport": 4499000,
    "320d Luxury": 4999000,
    "330i Sport": 5199000,
    "330i M Sport": 5699000,
    Other: 5099000,
  },
  "5 Series": {
    "520d Luxury": 6499000,
    "530d M Sport": 7499000,
    "530i M Sport": 6999000,
    Other: 6999000,
  },
  X1: {
    sDrive18i: 3999000,
    sDrive20d: 4299000,
    xDrive20d: 4799000,
    "M Sport": 4999000,
    Other: 4499000,
  },
  X3: {
    "xDrive20d Luxury": 6299000,
    "xDrive20d M Sport": 6899000,
    "xDrive30d M Sport": 7999000,
    Other: 6999000,
  },
  X5: { xDrive30d: 8299000, "xDrive40i M Sport": 9299000, Other: 8799000 },
  // Mercedes
  "C-Class": {
    C200: 5500000,
    C220d: 5500000,
    C300d: 5900000,
    "AMG C43": 8500000,
    Other: 5700000,
  },
  "E-Class": { E200: 6800000, E220d: 7200000, E350d: 8500000, Other: 7500000 },
  GLC: {
    "GLC 220d": 6500000,
    "GLC 300": 7000000,
    "AMG GLC 43": 8500000,
    Other: 7000000,
  },
  GLE: {
    "GLE 300d": 8500000,
    "GLE 400d": 9500000,
    "AMG GLE 53": 12000000,
    Other: 9500000,
  },
  "S-Class": {
    S350d: 16000000,
    S400d: 18000000,
    S500: 19000000,
    "Maybach S580": 25000000,
    Other: 17000000,
  },
  // Audi
  A4: {
    Premium: 4299000,
    "Premium Plus": 4699000,
    Technology: 5099000,
    Other: 4699000,
  },
  A6: { "Premium Plus": 5999000, Technology: 6799000, Other: 6399000 },
  Q3: { "Premium Plus": 4399000, Technology: 4899000, Other: 4649000 },
  Q5: { "Premium Plus": 5999000, Technology: 6599000, Other: 6299000 },
  Q7: { "Premium Plus": 7999000, Technology: 8799000, Other: 8399000 },
};

// Fuel types
const fuelTypes = ["Petrol", "Diesel", "CNG", "Electric", "Hybrid"];

// Transmission types
const transmissionTypes = ["Manual", "Automatic", "AMT", "CVT", "DCT"];

// Ownership types
const ownershipTypes = ["1st Owner", "2nd Owner", "3rd Owner", "4th+ Owner"];

// Condition grades
const conditionGrades = ["Excellent", "Good", "Average", "Below Average"];

// Accident types
const accidentTypes = ["None", "Minor Claim", "Major Structural"];

// --- Valuation Formula Constants ---

// Age depreciation table (year → retention %)
const ageDepreciation = {
  0: 0.9,
  1: 0.85,
  2: 0.8,
  3: 0.75,
  4: 0.6,
  5: 0.55,
  6: 0.5,
  7: 0.45,
};

// Brand factor mapping
const brandFactors = {
  "Maruti Suzuki": 1.05,
  Hyundai: 1.05,
  Toyota: 1.07,
  Tata: 1.05,
  Honda: 1.03,
  Kia: 1.03,
  Mahindra: 1.02,
  MG: 0.98,
  Volkswagen: 0.95,
  Skoda: 0.95,
  Renault: 0.92,
  Nissan: 0.93,
  Ford: 0.9,
  Jeep: 0.97,
  BMW: 0.93,
  "Mercedes-Benz": 0.94,
  Audi: 0.93,
  Volvo: 0.94,
  "Land Rover": 0.92,
  Jaguar: 0.9,
  Mini: 0.9,
  Porsche: 0.96,
  Lexus: 0.95,
  Isuzu: 0.93,
  Citroen: 0.9,
  BYD: 0.9,
  Datsun: 0.88,
  Fiat: 0.85,
  Mitsubishi: 0.88,
  Chevrolet: 0.85,
  Other: 0.92,
};

// Demand factor mapping
const demandFactors = { High: 1.08, Medium: 1.03, Low: 0.92 };

// Condition adjustment (INR)
const conditionAdjustments = {
  Excellent: 30000,
  Good: 25000,
  Average: 15000,
  "Below Average": -10000,
};

// Accident penalty (INR)
const accidentPenalties = {
  None: 0,
  "Minor Claim": 20000,
  "Major Structural": 40000,
};

// Urgency discount (INR)
const urgencyDiscounts = { High: 20000, Medium: 10000, Low: 0 };

// Ownership premium (INR) - 1st owner gets a premium, others get less
const ownershipPremiums = {
  "1st Owner": 10000,
  "2nd Owner": 0,
  "3rd Owner": -10000,
  "4th+ Owner": -20000,
};

// Expected KM per year for mileage deduction calc
const EXPECTED_KM_PER_YEAR = 12000;
// Rate per excess KM (INR)
const EXCESS_KM_RATE = 1.5;

// Generate years from current year to 2000
const currentYear = new Date().getFullYear();
const years = Array.from(
  { length: currentYear - 1999 },
  (_, i) => currentYear - i,
);

// Feature Card Component
const FeatureCard = memo(({ icon, title, description, bgColor }) => (
  <div
    className={`${bgColor} rounded-[20px] md:rounded-[24px] p-5 md:p-8 flex flex-col h-full min-h-[280px] border border-black shadow-[0px_4px_10px_rgba(0,0,0,0.25)]`}
  >
    <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-20 md:h-20 bg-white rounded-full flex items-center justify-center mb-4 md:mb-6 shadow-sm text-black flex-shrink-0">
      {icon}
    </div>
    <h3 className="w-full text-left font-['Bricolage_Grotesque'] font-bold text-[22px] sm:text-[28px] md:text-[42px] mb-2 md:mb-4 text-black leading-tight">
      {title}
    </h3>
    <p className="font-['Bricolage_Grotesque'] font-medium text-[13px] sm:text-[14px] md:text-[20px] text-black leading-snug tracking-tight sm:tracking-normal">
      {description}
    </p>
  </div>
));

// Step Card Component
const StepCard = memo(({ number, icon, title, description, bgColor }) => (
  <div className="bg-white rounded-[16px] md:rounded-[24px] p-1.5 md:p-3 flex flex-col h-full min-h-[200px] md:min-h-[240px] shadow-sm border border-gray-100/50 hover:-translate-y-1 md:hover:-translate-y-2 transition-transform duration-300">
    <div className="px-3 py-3 md:px-5 md:py-5 flex items-start justify-between">
      <span className="font-['Bricolage_Grotesque'] font-black text-[32px] sm:text-[40px] md:text-[64px] leading-none text-black tracking-tighter">
        {number}.
      </span>
      <div className="w-6 h-6 sm:w-8 sm:h-8 md:w-12 md:h-12 flex-shrink-0">
        {icon}
      </div>
    </div>
    <div
      className={`${bgColor} flex-1 rounded-[12px] md:rounded-[20px] p-3 sm:p-4 md:p-6 mt-1 flex flex-col justify-start`}
    >
      <h4 className="font-['Bricolage_Grotesque'] font-bold text-[14px] sm:text-[16px] md:text-[22px] text-black mb-1 md:mb-3 leading-tight min-h-[36px] sm:min-h-[44px] md:min-h-[60px] flex items-start">
        {title}
      </h4>
      <p className="font-['Bricolage_Grotesque'] font-medium text-[11px] sm:text-[13px] md:text-[17px] text-black leading-snug tracking-tight sm:tracking-normal">
        {description}
      </p>
    </div>
  </div>
));

// Seller Testimonial Card
const SellerCard = memo(
  ({ image, title, carName, quote, soldIn, whyLane, isMain }) => (
    <div
      className={`relative flex flex-col ${isMain ? "scale-100 z-10 mt-0 shadow-[0_15px_40px_rgba(0,0,0,0.15)] md:min-h-[585px] rounded-[24px]" : "scale-[0.95] opacity-100 mt-6 md:mt-12 shadow-lg h-auto rounded-[20px]"} transition-all duration-300 w-full`}
    >
      {/* The Badge */}
      <div
        className={`absolute -top-5 md:-top-6 left-1/2 transform -translate-x-1/2 z-30 flex items-center justify-center font-['Bricolage_Grotesque'] font-black tracking-tight whitespace-nowrap bg-no-repeat bg-center text-black ${isMain ? "text-[18px] md:text-[24px] px-8 md:px-12 pt-[14px] pb-[8px] md:pt-[18px] md:pb-[12px]" : "text-[14px] md:text-[18px] px-6 md:px-8 pt-[10px] pb-[6px] md:pt-[12px] md:pb-[8px]"}`}
        style={{
          backgroundImage: "url('/tag1.svg')",
          backgroundSize: "100% 100%",
        }}
      >
        {title}
      </div>

      <div
        className={`bg-white ${isMain ? "rounded-[24px]" : "rounded-[20px]"} overflow-hidden flex-1 flex flex-col border border-gray-100 relative z-20`}
      >
        <div
          className={`relative ${isMain ? "h-56 md:h-[280px]" : "h-40 md:h-[220px]"} flex-shrink-0 overflow-hidden border-b border-gray-100`}
        >
          <img
            src={image}
            alt={carName}
            className="w-full h-full object-cover"
          />
        </div>
        <div
          className={`flex-1 text-left bg-white flex flex-col ${isMain ? "px-6 py-6 md:px-8 md:pt-8 md:pb-8" : "px-4 py-4 md:px-6 md:py-6"}`}
        >
          <div className={`${isMain ? "mb-6" : "mb-4"}`}>
            <h4
              className={`font-['Bricolage_Grotesque'] font-extrabold text-[#01D28C] leading-tight tracking-tight ${isMain ? "text-[18px] md:text-[22px] mb-3" : "text-[14px] md:text-[16px] mb-2"}`}
            >
              {carName}
            </h4>
            <p
              className={`font-['Bricolage_Grotesque'] text-[#000000] font-medium tracking-normal ${isMain ? "text-[15px] md:text-[17px] leading-[1.5]" : "text-[12px] md:text-[14px] leading-[1.4]"}`}
            >
              "{quote}"
            </p>
          </div>
          <div
            className={`mt-auto ${isMain ? "space-y-2 pt-8" : "space-y-1 pt-6"}`}
          >
            <p
              className={`font-['Bricolage_Grotesque'] text-[#000000] font-medium tracking-normal ${isMain ? "text-[15px] md:text-[17px] leading-[1.4]" : "text-[12px] md:text-[14px] leading-[1.4]"}`}
            >
              Sold in: {soldIn}
            </p>
            <p
              className={`font-['Bricolage_Grotesque'] text-[#000000] font-medium tracking-normal ${isMain ? "text-[15px] md:text-[17px] leading-[1.4]" : "text-[12px] md:text-[14px] leading-[1.4]"}`}
            >
              <span className="text-[#01D28C] font-bold">Why Lane:</span>{" "}
              {whyLane}
            </p>
          </div>
        </div>
      </div>
    </div>
  ),
);

// FAQ Item Component
const FAQItem = memo(
  ({ question, answer = "Answer coming soon...", isOpen, onClick }) => (
    <div className="relative w-full">
      <button
        onClick={onClick}
        title={question}
        className={`w-full flex items-center justify-between border border-black px-4 md:px-6 py-2 transition-colors
        ${
          isOpen
            ? "bg-white rounded-t-[1rem] border-b-0"
            : "bg-white rounded-[1rem]"
        }`}
      >
        <span
          className={`font-['Bricolage_Grotesque'] font-semibold text-[14px] md:text-[16px] text-left pr-2 ${isOpen ? "line-clamp-4" : "line-clamp-1"}`}
        >
          {question}
        </span>
        <svg
          className={`w-5 h-5 transition-transform text-[#525252] flex-shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="bg-white px-4 md:px-6 py-2 md:py-3 rounded-b-[1rem] border border-t-0 border-black">
          <p className="font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[16px] text-gray-700 text-left leading-relaxed">
            {answer}
          </p>
        </div>
      )}
    </div>
  ),
);

const Sell = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [currentTestimonial, setCurrentTestimonial] = useState(1);
  const [openFAQ, setOpenFAQ] = useState(null);

  // Modal state for lead capture
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [estimatedOffer, setEstimatedOffer] = useState("");

  const [formData, setFormData] = useState({
    registrationNumber: "",
    make: "",
    model: "",
    trim: "",
    year: "",
    fuelType: "",
    transmission: "",
    ownership: "",
    kmDriven: "",
    condition: "",
    accidentType: "",
  });

  // Get available trims for selected model
  const availableTrims =
    formData.model && carTrims[formData.model]
      ? Object.keys(carTrims[formData.model])
      : [];

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name === "make") {
        return { ...prev, [name]: value, model: "", trim: "" };
      }
      if (name === "model") {
        return { ...prev, [name]: value, trim: "" };
      }
      return { ...prev, [name]: value };
    });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    const {
      registrationNumber,
      make,
      model,
      year,
      fuelType,
      transmission,
      ownership,
      kmDriven,
      condition,
      accidentType,
    } = formData;

    const missingFields = [];
    if (!registrationNumber) missingFields.push("Registration Number");
    if (!make) missingFields.push("Make");
    if (!model) missingFields.push("Model");
    if (!year) missingFields.push("Year");
    if (!fuelType) missingFields.push("Fuel Type");
    if (!transmission) missingFields.push("Transmission");
    if (!ownership) missingFields.push("Ownership");
    if (!kmDriven) missingFields.push("KM Driven");
    if (!condition) missingFields.push("Condition");
    if (!accidentType) missingFields.push("Accident History");

    if (missingFields.length > 0) {
      alert(`Please fill in: ${missingFields.join(", ")}`);
      return;
    }

    setIsModalOpen(true);
  };

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    if (!userName || !userPhone) {
      alert("Please fill in both Name and Phone Number.");
      return;
    }

    // Store lead in Supabase - all fields required
    const { error } = await supabase.from("sell_leads").insert([
      {
        registration_number: formData.registrationNumber,
        make: formData.make,
        model: formData.model,
        trim: formData.trim,
        year: formData.year,
        fuel_type: formData.fuelType,
        transmission: formData.transmission,
        ownership: formData.ownership,
        km_driven: formData.kmDriven,
        condition: formData.condition,
        accident_type: formData.accidentType,
        name: userName,
        phone: userPhone,
      },
    ]);

    if (error) {
      console.error("Error saving lead:", error);
      alert("Please fill in all the required details before submitting.");
      return;
    }

    // Capture UTM params
    const urlParams = new URLSearchParams(window.location.search);

    const utm_source = urlParams.get("utm_source");
    const utm_medium = urlParams.get("utm_medium");
    const utm_campaign = urlParams.get("utm_campaign");
    const utm_term = urlParams.get("utm_term");
    const utm_content = urlParams.get("utm_content");

    // Push event to GTM + GA4
    window.dataLayer = window.dataLayer || [];

    window.dataLayer.push({
      event: "sell_used_car_lead_submit",

      form_name: "sell_your_car",

      lead_type: "used_car_sell_lead",

      page_url: window.location.href,

      user_name: userName,

      phone: userPhone,

      registration_number: formData.registrationNumber,

      make: formData.make,
      model: formData.model,
      trim: formData.trim,
      year: formData.year,

      fuel_type: formData.fuelType,
      transmission: formData.transmission,
      ownership: formData.ownership,

      km_driven: formData.kmDriven,

      condition: formData.condition,

      accident_type: formData.accidentType,

      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
    });

    if (window.gtag) {
      window.gtag("event", "conversion", {
        send_to: "AW-16754360788/lgosCL2D5qwcENSDjbU-",
        value: 1.0,
        currency: "INR",
      });
    }

    // ===== VALUATION FORMULA =====
    // Final Price = (Base Price × Depreciation% × Demand Factor × Brand Factor)
    //   – Mileage Deduction + Condition Adjustment + Ownership Premium
    //   – Accident Penalty – Urgency Discount

    // 1. Base Price from trim/model data
    let basePrice = 0;
    if (
      formData.model &&
      formData.trim &&
      carTrims[formData.model] &&
      carTrims[formData.model][formData.trim]
    ) {
      basePrice = carTrims[formData.model][formData.trim];
    } else if (
      formData.model &&
      carTrims[formData.model] &&
      carTrims[formData.model]["Other"]
    ) {
      basePrice = carTrims[formData.model]["Other"];
    } else {
      // Fallback base prices by fuel type
      if (formData.fuelType === "Electric") basePrice = 1200000;
      else if (formData.fuelType === "Diesel") basePrice = 900000;
      else if (formData.fuelType === "CNG") basePrice = 750000;
      else if (formData.fuelType === "Hybrid") basePrice = 1100000;
      else basePrice = 750000;
    }

    // 2. Car Age & Depreciation %
    const calcYear = new Date().getFullYear();
    const carAge =
      calcYear - (formData.year ? parseInt(formData.year) : calcYear - 5);
    const clampedAge = Math.min(carAge, 7); // Cap at 7 years in table
    const depreciationPct =
      ageDepreciation[clampedAge] !== undefined
        ? ageDepreciation[clampedAge]
        : 0.3; // 7+ years fallback
    const depreciatedPrice = basePrice * depreciationPct;

    // 3. Demand Factor (default Medium for frontend estimate)
    const demandCategory = "Medium";
    const demandFactor = demandFactors[demandCategory];

    // 4. Brand Factor
    const brandFactor = brandFactors[formData.make] || brandFactors["Other"];

    // 5. Mileage Deduction
    const actualKm = parseInt(formData.kmDriven) || 0;
    const expectedKm = Math.max(carAge, 1) * EXPECTED_KM_PER_YEAR;
    const excessKm = Math.max(0, actualKm - expectedKm);
    const mileageDeduction = excessKm * EXCESS_KM_RATE;

    // 6. Condition Adjustment
    const conditionGrade = formData.condition || "Good";
    const conditionAdj = conditionAdjustments[conditionGrade] || 0;

    // 7. Ownership Premium
    const ownershipAdj = ownershipPremiums[formData.ownership] || 0;

    // 8. Accident Penalty
    const accidentPenalty = accidentPenalties[formData.accidentType] || 0;

    // 9. Urgency Discount (default Low for self-serve)
    const urgencyDiscount = urgencyDiscounts["Low"];

    // Final Fair Value
    const finalFairValue =
      depreciatedPrice * demandFactor * brandFactor -
      mileageDeduction +
      conditionAdj +
      ownershipAdj -
      accidentPenalty -
      urgencyDiscount;

    // Suggested Listing Price (~6% above fair value)
    const suggestedListingPrice = finalFairValue * 1.06;
    // Minimum Acceptable Price (~5% below fair value)
    const minimumAcceptablePrice = finalFairValue * 0.95;

    const formatLakhs = (val) => Math.max(0, val / 100000).toFixed(2);
    setEstimatedOffer(
      `₹${formatLakhs(minimumAcceptablePrice)} - ₹${formatLakhs(suggestedListingPrice)} Lakhs`,
    );

    // setIsModalOpen(false);
    // setShowResult(true);
    setIsModalOpen(false);

    window.location.href = "/thank-you";
  };

  const testimonials = [
    {
      title: "Seller profile 2",
      image: "/car2.png",
      carName: "2019 Honda City (Petrol)",
      quote:
        "I was worried about paperwork and ownership transfer. Everything was taken care of without me visiting the RTO.",
      soldIn: "4 days",
      whyLane: "End-to-end RTO support",
    },
    {
      title: "Seller profile 1",
      image: "/car1.png",
      carName: "Car: 2018 Hyundai i20 (Petrol)",
      quote:
        "Didn't want to deal with calls and bargaining. Lane handled the inspection, shared a clear price, and closed the sale smoothly.",
      soldIn: "6 days",
      whyLane: "Transparent pricing, zero hassle",
    },
    {
      title: "Seller profile 3",
      image: "/car3.png",
      carName: "2020 Maruti Baleno (Petrol)",
      quote:
        "The doorstep inspection made it easy. One fair offer, quick payment, and no last-minute deductions.",
      soldIn: "5 days",
      whyLane: "Fast, fair deal",
    },
  ];

  const faqsLeft = [
    {
      question: "What is Lane marketplace?",
      answer:
        "Lane is a transparent marketplace built to help you sell your car effortlessly and get the best value for it. Sell directly to a network of verified buyers, without the usual marketplace hassles. No confusion. No back-and-forth. Just fair pricing and a smooth, streamlined experience.",
    },
    {
      question: "How is this different from marketplace platforms?",
      answer:
        "There are no dealer auctions, no forced price reductions, and no bulk bidding involved — your car connects with the right next owner, not the lowest bidder.",
    },
    {
      question: "How is my car's price decided?",
      answer:
        "Based on model, condition, usage, and current market demand — with you having the final say.",
    },
    {
      question: "Do you help with RC transfer and documentation?",
      answer:
        "We support ownership transfer and documentation for a smooth handover.",
    },
    {
      question: "Can I sell a car with a loan or minor issues?",
      answer: "Share the details and we'll guide you through the process.",
    },
  ];

  const faqsRight = [
    {
      question: "Who are the buyers on this platform?",
      answer:
        "Verified individuals actively looking to purchase a car — including first-time buyers from our driving community with clear requirements and serious intent.",
    },
    {
      question: "Will I receive multiple calls or face bargaining?",
      answer:
        "We connect you only with qualified buyers after carefully screening every inquiry.",
    },
    {
      question: "How long does it usually take to sell a car?",
      answer:
        "Most cars are matched within 7–10 days, depending on pricing and vehicle condition.",
    },
    {
      question: "Does Lane purchase the car?",
      answer:
        "Lane is a trusted marketplace that facilitates transactions between sellers and verified buyers.",
    },
  ];

  const nextTestimonial = () => {
    setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setCurrentTestimonial(
      (prev) => (prev - 1 + testimonials.length) % testimonials.length,
    );
  };

  return (
    <div className="bg-white overflow-x-hidden">
      <Helmet>
        <title>Sell Your Car - InLane | Fast, Fair & Hassle Free</title>
        <meta
          name="description"
          content="Sell your car fast, fair and hassle-free with InLane. Get free valuation, doorstep inspection, and best offers from verified buyers."
        />
      </Helmet>

      <Navbar2
        backgroundColor="#FFFFFF"
        logo="/LANE_LOGO.svg"
        burgerMenu="/PurpleHamburger.png"
      />

      <section className="bg-[#00CE84] min-h-[750px] relative z-20 -mt-[2px] md:-mt-[4px] flex flex-col items-center md:items-start md:block pb-10 md:pb-0">
        {/* Background Watermark Pattern */}
        <div
          className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: "url('/White BG Pattern.svg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "repeat",
          }}
        ></div>

        {/* Car Image - Positioned bottom left */}
        <div className="relative md:absolute order-2 md:order-none mt-4 md:mt-0 md:-bottom-[5%] lg:-bottom-[12%] md:-left-[2%] lg:left-[5%] w-[110%] md:w-[85%] lg:w-[65%] max-w-[850px] z-20 pointer-events-none self-center flex justify-center">
          <img
            src="/MainCar.png"
            alt="Car"
            className="w-[95%] md:w-full h-auto mr-auto object-contain drop-shadow-[0_20px_35px_rgba(0,0,0,0.3)]"
          />
        </div>

        {/* Headlines - Top Left */}
        <div className="relative md:absolute order-1 md:order-none top-8 md:top-6 lg:top-8 left-0 md:left-[5%] lg:left-[8%] z-30 flex flex-col items-center w-full md:w-auto mt-[40px] md:mt-0 px-4 md:px-0">
          <div className="relative flex flex-col items-center w-full px-2 sm:px-4">
            <img
              src="/sales_tag.png"
              alt="Sell Your Car, Fast, Fair & Hassle Free"
              className="w-[90%] sm:w-full max-w-[450px] md:max-w-[600px] lg:max-w-[750px] object-contain drop-shadow-lg"
            />
          </div>
        </div>

        {/* Form - Right side */}
        <div className="relative md:absolute order-3 md:order-none -mt-4 sm:-mt-8 md:mt-0 md:top-[48%] md:-translate-y-1/2 right-0 left-0 md:left-auto md:right-12 lg:right-[8%] z-10 w-[94%] sm:w-[88%] mx-auto md:mx-0 md:w-[48%] lg:w-[42%] max-w-[540px] drop-shadow-2xl">
          <div className="bg-[#FCFCFC] rounded-[20px] md:rounded-[24px] p-6 sm:p-7 md:p-8 lg:p-10 shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-gray-200">
            {showResult ? (
              <div className="flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-500 py-4">
                <div className="w-16 h-16 bg-[#00CE84]/10 rounded-full flex items-center justify-center mb-6">
                  <span className="text-3xl">🎉</span>
                </div>
                <h3 className="font-['Bricolage_Grotesque'] text-[24px] font-extrabold text-black mb-3">
                  Your Valuation Is Ready!
                </h3>
                <p className="font-['Bricolage_Grotesque'] text-gray-600 text-[14px] leading-relaxed mb-6">
                  Based on the details provided, here is the estimated market
                  value for your {formData.year} {formData.make}{" "}
                  {formData.model}
                  {formData.trim && formData.trim !== "Other"
                    ? ` (${formData.trim})`
                    : ""}
                  :
                </p>
                <div className="w-full bg-[#F3FFB6] rounded-[16px] py-6 px-4 mb-6 border border-[#00CE84]/30 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)]">
                  <p className="font-['Bricolage_Grotesque'] text-[#00CE84] font-black text-2xl md:text-3xl tracking-tight leading-none">
                    {estimatedOffer}
                  </p>
                </div>
                <p className="font-['Bricolage_Grotesque'] text-[13px] text-gray-400 mb-8 px-2 leading-relaxed">
                  Our execution expert will call you at{" "}
                  <span className="text-black font-semibold">{userPhone}</span>{" "}
                  shortly to schedule a free doorstep inspection and finalize
                  your offer!
                </p>
                <button
                  onClick={() => {
                    setShowResult(false);
                    setFormData({
                      registrationNumber: "",
                      make: "",
                      model: "",
                      trim: "",
                      year: "",
                      fuelType: "",
                      transmission: "",
                      ownership: "",
                      kmDriven: "",
                      condition: "",
                      accidentType: "",
                    });
                    setUserName("");
                    setUserPhone("");
                  }}
                  className="w-full bg-black hover:bg-gray-800 text-white font-['Bricolage_Grotesque'] font-bold text-[15px] py-4 rounded-full transition-all duration-200"
                >
                  Start New Valuation
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="flex flex-col space-y-3 md:space-y-4 w-full"
              >
                {/* Registration Input */}
                <input
                  type="text"
                  name="registrationNumber"
                  value={formData.registrationNumber}
                  onChange={handleChange}
                  placeholder="Car Registration Number"
                  className="w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] text-gray-800 placeholder-black/40 focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] transition-all"
                />

                {/* Grid 1: Make & Model */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-4">
                  <div className="relative w-full">
                    <select
                      name="make"
                      value={formData.make}
                      onChange={handleChange}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.make ? "text-black/40" : "text-gray-800"}`}
                    >
                      <option value="" disabled>
                        Make
                      </option>
                      {carMakes.map((make) => (
                        <option
                          key={make}
                          value={make}
                          className="text-gray-800"
                        >
                          {make}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown
                        className="w-4 h-4 md:w-5 md:h-5 text-gray-400"
                        strokeWidth={2.5}
                      />
                    </div>
                  </div>

                  <div className="relative w-full">
                    <select
                      name="model"
                      value={formData.model}
                      onChange={handleChange}
                      disabled={!formData.make}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.model ? "text-black/40" : "text-gray-800"} ${!formData.make ? "opacity-70 cursor-not-allowed bg-gray-50" : ""}`}
                    >
                      <option value="" disabled>
                        Model
                      </option>
                      {formData.make &&
                        carModels[formData.make] &&
                        carModels[formData.make].map((model) => (
                          <option
                            key={model}
                            value={model}
                            className="text-gray-800"
                          >
                            {model}
                          </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown
                        className="w-4 h-4 md:w-5 md:h-5 text-gray-400"
                        strokeWidth={2.5}
                      />
                    </div>
                  </div>
                </div>

                {/* Grid 2: Variant/Trim & Year */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-4">
                  <div className="relative w-full">
                    <select
                      name="trim"
                      value={formData.trim}
                      onChange={handleChange}
                      disabled={!formData.model || availableTrims.length === 0}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.trim ? "text-black/40" : "text-gray-800"} ${!formData.model || availableTrims.length === 0 ? "opacity-70 cursor-not-allowed bg-gray-50" : ""}`}
                    >
                      <option value="" disabled>
                        Variant / Trim
                      </option>
                      {availableTrims.map((trim) => (
                        <option
                          key={trim}
                          value={trim}
                          className="text-gray-800"
                        >
                          {trim}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown
                        className="w-4 h-4 md:w-5 md:h-5 text-gray-400"
                        strokeWidth={2.5}
                      />
                    </div>
                  </div>

                  <div className="relative w-full">
                    <select
                      name="year"
                      value={formData.year}
                      onChange={handleChange}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.year ? "text-black/40" : "text-gray-800"}`}
                    >
                      <option value="" disabled>
                        Year
                      </option>
                      {years.map((year) => (
                        <option
                          key={year}
                          value={year}
                          className="text-gray-800"
                        >
                          {year}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown
                        className="w-4 h-4 md:w-5 md:h-5 text-gray-400"
                        strokeWidth={2.5}
                      />
                    </div>
                  </div>
                </div>

                {/* Grid 3: Fuel Type & Transmission */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-4">
                  <div className="relative w-full">
                    <select
                      name="fuelType"
                      value={formData.fuelType}
                      onChange={handleChange}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.fuelType ? "text-black/40" : "text-gray-800"}`}
                    >
                      <option value="" disabled>
                        Fuel Type
                      </option>
                      {fuelTypes.map((fuel) => (
                        <option
                          key={fuel}
                          value={fuel}
                          className="text-gray-800"
                        >
                          {fuel}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown
                        className="w-4 h-4 md:w-5 md:h-5 text-gray-400"
                        strokeWidth={2.5}
                      />
                    </div>
                  </div>

                  <div className="relative w-full">
                    <select
                      name="transmission"
                      value={formData.transmission}
                      onChange={handleChange}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.transmission ? "text-black/40" : "text-gray-800"}`}
                    >
                      <option value="" disabled>
                        Transmission
                      </option>
                      {transmissionTypes.map((trans) => (
                        <option
                          key={trans}
                          value={trans}
                          className="text-gray-800"
                        >
                          {trans}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown
                        className="w-4 h-4 md:w-5 md:h-5 text-gray-400"
                        strokeWidth={2.5}
                      />
                    </div>
                  </div>
                </div>

                {/* Grid 4: Ownership & KM Driven */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-4">
                  <div className="relative w-full">
                    <select
                      name="ownership"
                      value={formData.ownership}
                      onChange={handleChange}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.ownership ? "text-black/40" : "text-gray-800"}`}
                    >
                      <option value="" disabled>
                        Ownership
                      </option>
                      {ownershipTypes.map((owner) => (
                        <option
                          key={owner}
                          value={owner}
                          className="text-gray-800"
                        >
                          {owner}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown
                        className="w-4 h-4 md:w-5 md:h-5 text-gray-400"
                        strokeWidth={2.5}
                      />
                    </div>
                  </div>

                  <div className="relative w-full">
                    <input
                      type="number"
                      name="kmDriven"
                      value={formData.kmDriven}
                      onChange={handleChange}
                      placeholder="KM Driven"
                      min="0"
                      className="w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] text-gray-800 placeholder-black/40 focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] transition-all"
                    />
                  </div>
                </div>

                {/* Grid 5: Condition & Accident Type */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-4">
                  <div className="relative w-full">
                    <select
                      name="condition"
                      value={formData.condition}
                      onChange={handleChange}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.condition ? "text-black/40" : "text-gray-800"}`}
                    >
                      <option value="" disabled>
                        Condition
                      </option>
                      {conditionGrades.map((grade) => (
                        <option
                          key={grade}
                          value={grade}
                          className="text-gray-800"
                        >
                          {grade}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown
                        className="w-4 h-4 md:w-5 md:h-5 text-gray-400"
                        strokeWidth={2.5}
                      />
                    </div>
                  </div>

                  <div className="relative w-full">
                    <select
                      name="accidentType"
                      value={formData.accidentType}
                      onChange={handleChange}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.accidentType ? "text-black/40" : "text-gray-800"}`}
                    >
                      <option value="" disabled>
                        Accident History
                      </option>
                      {accidentTypes.map((type) => (
                        <option
                          key={type}
                          value={type}
                          className="text-gray-800"
                        >
                          {type}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown
                        className="w-4 h-4 md:w-5 md:h-5 text-gray-400"
                        strokeWidth={2.5}
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Button - sticky on mobile */}
                <div className="flex justify-center pt-3 pb-2 sticky bottom-0 z-30 bg-[#FCFCFC]">
                  <button
                    type="submit"
                    className="hover:-translate-y-0.5 transition-transform duration-200"
                  >
                    <img
                      src="/button.png"
                      alt="Get My Offer"
                      className="h-[46px] md:h-[52px] xl:h-[56px] w-auto object-contain drop-shadow-sm hover:drop-shadow-md transition-all"
                    />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="-mt-1 pt-16 sm:pt-20 md:pt-24 pb-6 md:pb-8 px-4 md:px-8 bg-[#00CE84] relative z-0 overflow-hidden">
        {/* Background Watermark Pattern (continued from Hero) */}
        <div
          className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: "url('/White BG Pattern.svg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "repeat",
          }}
        ></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {/* Free Valuation - Yellow-Green */}
            <FeatureCard
              bgColor="bg-[#D9FF7A]"
              icon={
                <img
                  src="/l1.png"
                  alt="Free Valuation Icon"
                  className="w-full h-full object-contain"
                />
              }
              title={
                <>
                  Free
                  <br />
                  Valuation
                </>
              }
              description="See your car's value instantly, then profile your vehicle. Quick, easy to follow and vehicle is listed in few steps"
            />
            {/* Door Step Inspection - Orange */}
            <FeatureCard
              bgColor="bg-[#FFC229]"
              icon={
                <img
                  src="/l2.png"
                  alt="Door Step Inspection Icon"
                  className="w-full h-full object-contain"
                />
              }
              title={
                <>
                  Door Step
                  <br />
                  Inspection
                </>
              }
              description="Our expert inspects the car and prepare a detailed report for final valuation"
            />
            {/* Best Offer - Magenta/Pink */}
            <FeatureCard
              bgColor="bg-[#FF99F5]"
              icon={
                <img
                  src="/l3.png"
                  alt="Best Offer Icon"
                  className="w-full h-full object-contain"
                />
              }
              title={
                <>
                  Best
                  <br />
                  Offer
                </>
              }
              description="Get offers from our buyer or learners who have learned driving with us. Speedy close of transaction"
            />
            {/* Secure Deal - Cyan/Blue */}
            <FeatureCard
              bgColor="bg-[#87CEEB]"
              icon={
                <img
                  src="/l4.png"
                  alt="Secure Deal Icon"
                  className="w-full h-full object-contain"
                />
              }
              title={
                <>
                  Secure
                  <br />
                  Deal
                </>
              }
              description="Accept the offer, handover the car to the buyer and we'll securely handle the payment and ownership transfer"
            />
          </div>
        </div>
      </section>

      {/* What Our Buyers Love Section */}
      <section className="pt-4 md:pt-6 pb-0 px-4 md:px-8 bg-white relative z-10 flex overflow-visible">
        <div className="max-w-[1305px] mx-auto w-full flex items-stretch">
          <div className="flex flex-col md:flex-row items-center md:items-stretch justify-between w-full gap-0 md:gap-16">
            {/* Title */}
            <div className="text-center md:text-left w-full md:w-[45%] lg:w-[40%] flex flex-col items-center md:items-start pl-0 md:pl-10 lg:pl-8 self-center pb-4 md:pb-8">
              <img
                src="/s2_text.png"
                alt="What Our Buyers Love"
                className="w-[85%] md:w-full max-w-[400px] md:max-w-[500px] object-contain drop-shadow-md"
              />
            </div>

            {/* Signpost Stats */}
            <div className="relative w-full md:w-[55%] lg:w-[60%] flex items-end justify-center md:justify-end xl:pr-10 z-20 mt-4 md:mt-0">
              <div className="relative w-full max-w-[400px] md:max-w-[713px] flex justify-center items-end bottom-0">
                <img
                  src="/polewithdesc.png"
                  alt="What Buyers Love Stats"
                  className="w-full h-auto object-contain object-bottom md:mb-[-1px]"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-8 md:py-12 px-4 md:px-8 bg-[#D1B3FF]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 flex justify-center">
            <div className="relative inline-block mt-4 md:mt-6 mb-4">
              {/* Green background for title */}
              <div
                className="absolute -inset-y-4 -inset-x-6 md:-inset-y-6 md:-inset-x-8 z-0 bg-no-repeat bg-center"
                style={{
                  backgroundImage: "url('/s3_bkg.png')",
                  backgroundSize: "100% 100%",
                }}
              ></div>
              <img
                src="/s3_text.png"
                alt="How It Works?"
                className="relative z-10 w-full max-w-[280px] md:max-w-[380px] object-contain drop-shadow-md px-2 py-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mt-6 md:mt-10">
            <StepCard
              number="1"
              icon={
                <img
                  src="/1.png"
                  alt="List Your Car"
                  className="w-full h-full object-contain"
                />
              }
              title="List Your Car"
              description="Get an instant estimated price"
              bgColor="bg-[#D8FF7A]"
            />
            <StepCard
              number="2"
              icon={
                <img
                  src="/2.png"
                  alt="Door Step Inspection"
                  className="w-full h-full object-contain"
                />
              }
              title="Door Step Inspection"
              description="Expert car check + document verification"
              bgColor="bg-[#FFB03A]"
            />
            <StepCard
              number="3"
              icon={
                <img
                  src="/3.png"
                  alt="Best Offer"
                  className="w-full h-full object-contain"
                />
              }
              title="Best Offer"
              description="Price at your terms"
              bgColor="bg-[#00CE84]"
            />
            <StepCard
              number="4"
              icon={
                <img
                  src="/4.png"
                  alt="RTO & Ownership"
                  className="w-full h-full object-contain"
                />
              }
              title="RTO & Ownership"
              description="Lane handles ownership & paperwork end-to-end"
              bgColor="bg-[#7FEFFF]"
            />
          </div>
        </div>
      </section>

      {/* Sellers Section */}
      <section className="bg-white overflow-visible">
        {/* Top Green Part */}
        <div className="bg-[#00CE84] pt-12 sm:pt-16 md:pt-24 pb-8 sm:pb-12 md:pb-16 px-4 md:px-8 text-center flex flex-col items-center">
          <div className="w-full max-w-[1300px] flex flex-col items-center">
            <img
              src="/s4.png"
              alt="Sellers Are Already Selling With Lane"
              className="w-[90%] md:w-full max-w-[500px] lg:max-w-[700px] object-contain relative z-20"
            />
            <p className="font-['Bricolage_Grotesque'] text-[#000000] text-[13px] sm:text-[18px] md:text-[26px] font-normal mt-4 md:mt-6 lg:mt-8 max-w-[612px] leading-[1.4] mx-auto tracking-normal relative z-20">
              See how car owner's listed and sold with lane and
              <br className="hidden md:block" /> list your vehicle in few steps
              and get started.
            </p>
          </div>
        </div>

        {/* Bottom White Part containing Carousel */}
        <div className="bg-white relative z-10 px-4 md:px-8 pt-16 md:pt-20 pb-20 md:pb-28">
          <div className="max-w-[1300px] mx-auto text-center relative">
            {/* Testimonials Carousel */}
            <div className="relative w-full mx-auto px-0 md:px-4 overflow-x-hidden md:overflow-visible py-8 md:py-0">
              {/* Desktop Infinite Carousel */}
              <div className="hidden md:grid grid-cols-[26fr_48fr_26fr] gap-8 w-full items-start relative z-10 transition-all duration-300">
                {[
                  testimonials[
                    (currentTestimonial - 1 + testimonials.length) %
                      testimonials.length
                  ],
                  testimonials[currentTestimonial],
                  testimonials[(currentTestimonial + 1) % testimonials.length],
                ].map((testimonial, idx) => {
                  const isMain = idx === 1;
                  return (
                    <div
                      key={testimonial.title + idx}
                      className={`${isMain ? "block relative z-30 h-full" : "hidden md:block relative z-10 h-auto"} transition-all duration-500`}
                    >
                      <SellerCard {...testimonial} isMain={isMain} />
                      {/* Render arrows attached only to the main card */}
                      {isMain && (
                        <>
                          <button
                            onClick={prevTestimonial}
                            className="absolute top-[140px] -translate-y-1/2 left-0 -translate-x-1/2 z-40 w-14 h-14 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-all text-white border border-white/20"
                          >
                            <ChevronLeft className="w-8 h-8" />
                          </button>
                          <button
                            onClick={nextTestimonial}
                            className="absolute top-[140px] -translate-y-1/2 right-0 translate-x-1/2 z-40 w-14 h-14 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-all text-white border border-white/20"
                          >
                            <ChevronRight className="w-8 h-8" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Mobile Dynamic Height Layout */}
              <div className="flex md:hidden w-full relative z-10 justify-center items-start pb-8">
                {/* Left Card */}
                <div className="absolute top-6 -left-[70%] w-[80%] z-10">
                  <SellerCard
                    {...testimonials[
                      (currentTestimonial - 1 + testimonials.length) %
                        testimonials.length
                    ]}
                    isMain={false}
                  />
                </div>

                {/* Right Card */}
                <div className="absolute top-6 -right-[70%] w-[80%] z-10">
                  <SellerCard
                    {...testimonials[
                      (currentTestimonial + 1) % testimonials.length
                    ]}
                    isMain={false}
                  />
                </div>

                {/* Main Card (Relative positioning gives container dynamic height) */}
                <div className="relative w-[80%] z-30">
                  <SellerCard
                    {...testimonials[currentTestimonial]}
                    isMain={true}
                  />

                  {/* Arrows placed precisely over the car image, straddling the bounds. */}
                  <button
                    onClick={prevTestimonial}
                    className="absolute top-[90px] left-0 -translate-x-1/2 z-40 w-10 h-10 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-all text-white border border-white/20 shadow-md"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={nextTestimonial}
                    className="absolute top-[90px] right-0 translate-x-1/2 z-40 w-10 h-10 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-all text-white border border-white/20 shadow-md"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 md:py-24 px-4 md:px-8 bg-[#D1B3FF] relative z-0 overflow-hidden">
        {/* Background Watermark Pattern */}
        <div
          className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: "url('/White BG Pattern.svg')",
            backgroundSize: "1000px",
            backgroundPosition: "center",
            backgroundRepeat: "repeat",
          }}
        ></div>

        <div className="max-w-[1305px] mx-auto relative z-10 w-full flex justify-center">
          <div className="bg-white rounded-[24px] md:rounded-[40px] p-6 md:px-[60px] md:py-[50px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] h-auto w-full max-w-[1050px]">
            <img
              src="/faq_tag.png"
              alt="Frequently Asked Questions"
              className="w-[85%] sm:w-[70%] md:w-[60%] max-w-[500px] h-auto object-contain mb-6 md:mb-[32px] block"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 md:gap-x-[40px] gap-y-3 md:gap-y-[10px]">
              <div className="flex flex-col items-start space-y-3 md:space-y-[12px] w-full">
                {faqsLeft.map((faq, index) => (
                  <FAQItem
                    key={index}
                    question={faq.question}
                    answer={faq.answer}
                    isOpen={openFAQ === `left-${index}`}
                    onClick={() =>
                      setOpenFAQ(
                        openFAQ === `left-${index}` ? null : `left-${index}`,
                      )
                    }
                  />
                ))}
              </div>
              <div className="flex flex-col items-start space-y-3 md:space-y-[12px] w-full">
                {faqsRight.map((faq, index) => (
                  <FAQItem
                    key={index}
                    question={faq.question}
                    answer={faq.answer}
                    isOpen={openFAQ === `right-${index}`}
                    onClick={() =>
                      setOpenFAQ(
                        openFAQ === `right-${index}` ? null : `right-${index}`,
                      )
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Lead Capture Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-[24px] p-8 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in duration-200">
            {/* Close Button */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            <div className="text-center mb-6">
              <h3 className="font-['Bricolage_Grotesque'] text-[24px] font-extrabold text-black mb-2">
                Almost exactly there!
              </h3>
              <p className="font-['Bricolage_Grotesque'] text-gray-600 text-sm">
                Please tell us who we're valuing this car for so we can send you
                the offer.
              </p>
            </div>

            <form onSubmit={handleFinalSubmit} className="space-y-4">
              <div>
                <label className="block font-['Bricolage_Grotesque'] text-sm font-semibold text-gray-700 mb-1">
                  Your Full Name
                </label>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-3 rounded-[12px] border border-gray-200 focus:border-[#00CE84] focus:ring-2 focus:ring-[#00CE84]/20 outline-none transition-all font-['Bricolage_Grotesque']"
                />
              </div>

              <div>
                <label className="block font-['Bricolage_Grotesque'] text-sm font-semibold text-gray-700 mb-1">
                  Your Phone Number
                </label>
                <input
                  type="tel"
                  required
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-4 py-3 rounded-[12px] border border-gray-200 focus:border-[#00CE84] focus:ring-2 focus:ring-[#00CE84]/20 outline-none transition-all font-['Bricolage_Grotesque']"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-6 bg-[#00CE84] hover:bg-[#00b574] text-white font-['Bricolage_Grotesque'] font-bold text-lg py-4 rounded-full shadow-[0_4px_14px_0_rgba(0,206,132,0.39)] hover:shadow-[0_6px_20px_rgba(0,206,132,0.23)] hover:-translate-y-1 transition-all duration-200"
              >
                Get My Valuation Now
              </button>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default Sell;
