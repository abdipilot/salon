-- SalonHub Database Schema
-- PostgreSQL 16 with Row-Level Security

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMS ───────────────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_STAFF', 'CUSTOMER');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE shop_category AS ENUM ('SALON', 'BARBER', 'MAKEUP', 'COMBO');
CREATE TYPE subscription_status AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE service_category AS ENUM ('Hair', 'Makeup', 'Nails', 'Skin', 'Massage', 'Beard', 'Other');
CREATE TYPE appointment_status AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE payment_status AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE');
CREATE TYPE payment_method AS ENUM ('CASH', 'CARD', 'MPESA', 'BANK_TRANSFER', 'CREDIT');
CREATE TYPE debt_status AS ENUM ('ACTIVE', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');
CREATE TYPE billing_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
CREATE TYPE gender_type AS ENUM ('M', 'F', 'OTHER');

-- ─── SUBSCRIPTION PLANS ──────────────────────────────────────────────────────
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_per_month DECIMAL(10,2) NOT NULL DEFAULT 0,
    max_staff INT NOT NULL DEFAULT 5,
    max_customers INT NOT NULL DEFAULT 100,
    max_appointments_per_month INT NOT NULL DEFAULT 200,
    features JSONB NOT NULL DEFAULT '{"advanced_analytics":false,"inventory":false,"staff_management":false}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── USERS ───────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role user_role NOT NULL DEFAULT 'CUSTOMER',
    shop_id UUID,
    status user_status NOT NULL DEFAULT 'ACTIVE',
    email_verified BOOLEAN NOT NULL DEFAULT false,
    email_verification_token VARCHAR(255),
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_shop_id ON users(shop_id);

-- ─── SHOPS ───────────────────────────────────────────────────────────────────
CREATE TABLE shops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id),
    business_name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) UNIQUE,
    category shop_category NOT NULL DEFAULT 'SALON',
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Kenya',
    logo_url VARCHAR(500),
    banner_url VARCHAR(500),
    description TEXT,
    opening_time TIME DEFAULT '08:00:00',
    closing_time TIME DEFAULT '18:00:00',
    timezone VARCHAR(50) DEFAULT 'Africa/Nairobi',
    subscription_status subscription_status NOT NULL DEFAULT 'TRIAL',
    trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
    subscription_plan_id UUID REFERENCES subscription_plans(id),
    billing_cycle_start DATE,
    next_billing_date DATE,
    auto_renew BOOLEAN DEFAULT true,
    currency_code VARCHAR(3) DEFAULT 'KES',
    tax_percentage DECIMAL(5,2) DEFAULT 0,
    service_buffer_minutes INT DEFAULT 15,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shops_owner_id ON shops(owner_id);
CREATE INDEX idx_shops_subscription_status ON shops(subscription_status);
CREATE INDEX idx_shops_slug ON shops(slug);

ALTER TABLE users ADD CONSTRAINT fk_users_shop_id FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL;

-- ─── SERVICES ────────────────────────────────────────────────────────────────
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category service_category NOT NULL DEFAULT 'Other',
    base_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    duration_minutes INT NOT NULL DEFAULT 60,
    image_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(shop_id, name)
);

CREATE INDEX idx_services_shop_id ON services(shop_id);

-- ─── SERVICE PACKAGES ────────────────────────────────────────────────────────
CREATE TABLE service_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    package_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    duration_minutes INT NOT NULL DEFAULT 60,
    image_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_packages_shop_id ON service_packages(shop_id);

CREATE TABLE package_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(package_id, service_id)
);

-- ─── CUSTOMERS ───────────────────────────────────────────────────────────────
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    gender gender_type,
    date_of_birth DATE,
    customer_code VARCHAR(50),
    total_spent DECIMAL(10,2) DEFAULT 0,
    loyalty_points INT DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(shop_id, customer_code)
);

CREATE INDEX idx_customers_shop_id ON customers(shop_id);
CREATE INDEX idx_customers_shop_phone ON customers(shop_id, phone);
CREATE INDEX idx_customers_name ON customers(shop_id, first_name, last_name);

-- ─── APPOINTMENTS ────────────────────────────────────────────────────────────
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    package_id UUID REFERENCES service_packages(id) ON DELETE SET NULL,
    staff_id UUID NOT NULL REFERENCES users(id),
    appointment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status appointment_status NOT NULL DEFAULT 'PENDING',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appointments_shop_id ON appointments(shop_id);
CREATE INDEX idx_appointments_customer_id ON appointments(customer_id);
CREATE INDEX idx_appointments_staff_id ON appointments(staff_id);
CREATE INDEX idx_appointments_shop_date ON appointments(shop_id, appointment_date);

-- ─── INVOICES ────────────────────────────────────────────────────────────────
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    invoice_number VARCHAR(50) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_status payment_status NOT NULL DEFAULT 'PENDING',
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    UNIQUE(shop_id, invoice_number)
);

CREATE INDEX idx_invoices_shop_id ON invoices(shop_id);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_payment_status ON invoices(shop_id, payment_status);

CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description VARCHAR(300) NOT NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    package_id UUID REFERENCES service_packages(id) ON DELETE SET NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- ─── PAYMENTS ────────────────────────────────────────────────────────────────
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    payment_method payment_method NOT NULL DEFAULT 'CASH',
    amount_paid DECIMAL(10,2) NOT NULL,
    payment_reference VARCHAR(200),
    notes TEXT,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_shop_id ON payments(shop_id);

-- ─── CUSTOMER DEBTS ──────────────────────────────────────────────────────────
CREATE TABLE customer_debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    original_amount DECIMAL(10,2) NOT NULL,
    remaining_amount DECIMAL(10,2) NOT NULL,
    due_date DATE,
    status debt_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_debts_shop_id ON customer_debts(shop_id);
CREATE INDEX idx_customer_debts_customer_id ON customer_debts(customer_id);

CREATE INDEX idx_invoices_appointment_id ON invoices(appointment_id);

-- ─── EXPENSES ────────────────────────────────────────────────────────────────
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL DEFAULT 'General',
    description VARCHAR(300) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method payment_method DEFAULT 'CASH',
    reference VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_shop_id ON expenses(shop_id);
CREATE INDEX idx_expenses_shop_date ON expenses(shop_id, expense_date);

-- ─── BILLING RECORDS ─────────────────────────────────────────────────────────
CREATE TABLE billing_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    subscription_plan_id UUID REFERENCES subscription_plans(id),
    billing_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount_due DECIMAL(10,2) NOT NULL,
    status billing_status NOT NULL DEFAULT 'PENDING',
    payment_reference VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_records_shop_id ON billing_records(shop_id);

-- ─── REFRESH TOKENS ──────────────────────────────────────────────────────────
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE services FORCE ROW LEVEL SECURITY;
ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_packages FORCE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items FORCE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_debts FORCE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;

-- RLS Policies with super admin bypass and shop isolation
CREATE POLICY rls_services ON services USING (
    COALESCE(current_setting('app.role', true), '') = 'SUPER_ADMIN'
    OR (COALESCE(current_setting('app.current_shop_id', true), '') <> ''
        AND shop_id = current_setting('app.current_shop_id', true)::UUID)
);

CREATE POLICY rls_service_packages ON service_packages USING (
    COALESCE(current_setting('app.role', true), '') = 'SUPER_ADMIN'
    OR (COALESCE(current_setting('app.current_shop_id', true), '') <> ''
        AND shop_id = current_setting('app.current_shop_id', true)::UUID)
);

CREATE POLICY rls_customers ON customers USING (
    COALESCE(current_setting('app.role', true), '') = 'SUPER_ADMIN'
    OR (COALESCE(current_setting('app.current_shop_id', true), '') <> ''
        AND shop_id = current_setting('app.current_shop_id', true)::UUID)
);

CREATE POLICY rls_appointments ON appointments USING (
    COALESCE(current_setting('app.role', true), '') = 'SUPER_ADMIN'
    OR (COALESCE(current_setting('app.current_shop_id', true), '') <> ''
        AND shop_id = current_setting('app.current_shop_id', true)::UUID)
);

CREATE POLICY rls_invoices ON invoices USING (
    COALESCE(current_setting('app.role', true), '') = 'SUPER_ADMIN'
    OR (COALESCE(current_setting('app.current_shop_id', true), '') <> ''
        AND shop_id = current_setting('app.current_shop_id', true)::UUID)
);

CREATE POLICY rls_invoice_items ON invoice_items USING (
    COALESCE(current_setting('app.role', true), '') = 'SUPER_ADMIN'
    OR EXISTS (
        SELECT 1 FROM invoices i WHERE i.id = invoice_id
        AND (COALESCE(current_setting('app.current_shop_id', true), '') <> ''
             AND i.shop_id = current_setting('app.current_shop_id', true)::UUID)
    )
);

CREATE POLICY rls_payments ON payments USING (
    COALESCE(current_setting('app.role', true), '') = 'SUPER_ADMIN'
    OR (COALESCE(current_setting('app.current_shop_id', true), '') <> ''
        AND shop_id = current_setting('app.current_shop_id', true)::UUID)
);

CREATE POLICY rls_customer_debts ON customer_debts USING (
    COALESCE(current_setting('app.role', true), '') = 'SUPER_ADMIN'
    OR (COALESCE(current_setting('app.current_shop_id', true), '') <> ''
        AND shop_id = current_setting('app.current_shop_id', true)::UUID)
);

CREATE POLICY rls_expenses ON expenses USING (
    COALESCE(current_setting('app.role', true), '') = 'SUPER_ADMIN'
    OR (COALESCE(current_setting('app.current_shop_id', true), '') <> ''
        AND shop_id = current_setting('app.current_shop_id', true)::UUID)
);

-- ─── HELPER FUNCTION: Updated timestamp trigger ───────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_shops_updated BEFORE UPDATE ON shops FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_services_updated BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_packages_updated BEFORE UPDATE ON service_packages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_appointments_updated BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_debts_updated BEFORE UPDATE ON customer_debts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_billing_updated BEFORE UPDATE ON billing_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── SEED: DEFAULT SUBSCRIPTION PLANS ────────────────────────────────────────
INSERT INTO subscription_plans (name, description, price_per_month, max_staff, max_customers, max_appointments_per_month, features) VALUES
('Starter', 'Perfect for solo stylists and small shops', 999.00, 2, 200, 150,
 '{"advanced_analytics":false,"inventory":false,"staff_management":false}'),
('Professional', 'For growing salons with a team', 2499.00, 10, 1000, 500,
 '{"advanced_analytics":false,"inventory":true,"staff_management":true}'),
('Business', 'Full-featured for busy salons', 4999.00, 30, 5000, 2000,
 '{"advanced_analytics":true,"inventory":true,"staff_management":true}'),
('Enterprise', 'Unlimited everything for multi-location businesses', 9999.00, 9999, 99999, 99999,
 '{"advanced_analytics":true,"inventory":true,"staff_management":true}');

-- ─── NOTE: Super admin is created by the backend on first boot ────────────────
-- See: backend/src/db/seed.ts
