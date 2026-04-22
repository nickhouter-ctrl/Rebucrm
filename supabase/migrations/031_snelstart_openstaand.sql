-- Snelstart openstaand-saldo per factuur cachen zodat dashboard-openstaand
-- exact overeenkomt met SnelStart (inclusief credit-overschot en historische creditnota's).
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS snelstart_openstaand NUMERIC(12,2);
