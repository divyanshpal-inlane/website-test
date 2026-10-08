import { TextField, FormHelperText } from "@mui/material";
import { UserRound } from "lucide-react";

export default function CustomerDetails({ areaName, customer, onChange }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <UserRound className="h-5 w-5 text-[#00ce84]" />
        <h2 className="text-xl font-semibold">Your details</h2>
      </div>
      <p className="text-gray-500 text-sm mb-4">
        We use your phone number to reach you about lessons and tests.
      </p>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-600 mb-5">
        <span>
          <span className="font-medium text-gray-900">Area:</span> {areaName || "—"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField
          label="Full name *"
          value={customer.name}
          onChange={(e) => onChange({ name: e.target.value })}
          fullWidth
          size="small"
          autoComplete="name"
        />
        <TextField
          label="Phone number *"
          value={customer.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          fullWidth
          size="small"
          inputMode="numeric"
          autoComplete="tel"
          helperText={customer.phone && !/^\d{10}$/.test(customer.phone.replace(/\D/g, "")) ? (
            <FormHelperText error>Enter a valid 10-digit number.</FormHelperText>
          ) : null}
        />
        <TextField
          label="Email *"
          type="email"
          value={customer.email}
          onChange={(e) => onChange({ email: e.target.value })}
          fullWidth
          size="small"
          autoComplete="email"
        />
        <TextField
          label="City (optional)"
          value={customer.city}
          onChange={(e) => onChange({ city: e.target.value })}
          fullWidth
          size="small"
          autoComplete="address-level2"
        />
      </div>

      <TextField
        label="Pickup address (optional)"
        value={customer.address}
        onChange={(e) => onChange({ address: e.target.value })}
        fullWidth
        multiline
        minRows={2}
        margin="normal"
        size="small"
        placeholder="E.g. 12, MG Road, near the park"
      />
    </section>
  );
}