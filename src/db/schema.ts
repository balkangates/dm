import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["customer", "store", "admin"]);
export const productType = pgEnum("product_type", ["original", "aftermarket", "equivalent"]);
export const paymentMethod = pgEnum("payment_method", ["bank_transfer", "card"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const amount = (name: string) => numeric(name, { precision: 12, scale: 2 });

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").default("customer").notNull(),
  phone: varchar("phone", { length: 30 }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_email_unique").on(t.email)]);

export const stores = pgTable("stores", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  name: varchar("name", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull(),
  description: text("description"),
  city: varchar("city", { length: 100 }),
  logoUrl: text("logo_url"),
  iban: varchar("iban", { length: 34 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).default("10.00").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("stores_slug_unique").on(t.slug), index("stores_owner_idx").on(t.ownerId), check("stores_status_check", sql`${t.status} in ('pending','approved','suspended')`)]);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").default(0).notNull(),
}, (t) => [uniqueIndex("categories_slug_unique").on(t.slug), index("categories_parent_idx").on(t.parentId)]);

export const vehicleBrands = pgTable("vehicle_brands", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
}, (t) => [uniqueIndex("vehicle_brands_name_unique").on(t.name)]);

export const vehicleModels = pgTable("vehicle_models", {
  id: uuid("id").defaultRandom().primaryKey(),
  brandId: uuid("brand_id").notNull().references(() => vehicleBrands.id),
  name: varchar("name", { length: 100 }).notNull(),
}, (t) => [uniqueIndex("vehicle_models_brand_name_unique").on(t.brandId, t.name)]);

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  oemNo: varchar("oem_no", { length: 100 }).notNull(),
  normalizedOem: varchar("normalized_oem", { length: 100 }).notNull(),
  productName: varchar("product_name", { length: 250 }).notNull(),
  categoryId: uuid("category_id").references(() => categories.id),
  subcategoryId: uuid("subcategory_id").references(() => categories.id),
  description: text("description"),
  unit: varchar("unit", { length: 30 }).default("Adet").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("products_normalized_oem_unique").on(t.normalizedOem),
  index("products_category_idx").on(t.categoryId),
  check("products_oem_normalization_check", sql`${t.normalizedOem} = regexp_replace(upper(${t.oemNo}), '[^A-Z0-9]', '', 'g') and length(${t.normalizedOem}) > 0`),
]);

export const productVehicleFitments = pgTable("product_vehicle_fitments", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id),
  vehicleModelId: uuid("vehicle_model_id").notNull().references(() => vehicleModels.id),
  yearFrom: integer("year_from"),
  yearTo: integer("year_to"),
  engine: varchar("engine", { length: 100 }),
}, (t) => [index("fitment_product_idx").on(t.productId), index("fitment_model_idx").on(t.vehicleModelId)]);

export const garageVehicles = pgTable("garage_vehicles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  brand: varchar("brand", { length: 100 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  year: integer("year").notNull(),
  engine: varchar("engine", { length: 100 }),
  trim: varchar("trim", { length: 100 }),
  createdAt: createdAt(),
}, (t) => [index("garage_user_idx").on(t.userId)]);

export const storeProducts = pgTable("store_products", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  catalogProductId: uuid("catalog_product_id").notNull().references(() => products.id),
  brand: varchar("brand", { length: 120 }).notNull(),
  productType: productType("product_type").notNull(),
  storeSku: varchar("store_sku", { length: 120 }).notNull(),
  barcode: varchar("barcode", { length: 120 }),
  price: amount("price").notNull(),
  stock: integer("stock").default(0).notNull(),
  imageUrl: text("image_url"),
  active: boolean("active").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("store_products_store_sku_unique").on(t.storeId, t.storeSku),
  uniqueIndex("store_products_identity_unique").on(t.storeId, t.catalogProductId, t.brand, t.productType),
  index("store_products_catalog_idx").on(t.catalogProductId),
  index("store_products_brand_idx").on(t.brand),
  index("store_products_type_idx").on(t.productType),
  index("store_products_price_idx").on(t.price),
  index("store_products_active_stock_idx").on(t.active, t.stock),
  check("store_products_price_check", sql`${t.price} > 0`),
  check("store_products_stock_check", sql`${t.stock} >= 0`),
]);

export const oemProductRequests = pgTable("oem_product_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  oemNo: varchar("oem_no", { length: 100 }).notNull(),
  normalizedOem: varchar("normalized_oem", { length: 100 }).notNull(),
  suggestedName: varchar("suggested_name", { length: 250 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  productId: uuid("product_id").references(() => products.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("oem_requests_store_oem_unique").on(t.storeId, t.normalizedOem), index("oem_requests_status_idx").on(t.status)]);

export const quoteRequests = pgTable("quote_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").notNull().references(() => users.id),
  vehicleBrand: varchar("vehicle_brand", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYear: integer("vehicle_year"),
  oemNo: varchar("oem_no", { length: 100 }),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  brandPreference: varchar("brand_preference", { length: 120 }),
  city: varchar("city", { length: 100 }).notNull(),
  photoUrl: text("photo_url"),
  status: varchar("status", { length: 20 }).default("open").notNull(),
  createdAt: createdAt(),
}, (t) => [index("quote_requests_customer_idx").on(t.customerId), index("quote_requests_status_idx").on(t.status), check("quote_requests_quantity_check", sql`${t.quantity} > 0`)]);

export const quoteOffers = pgTable("quote_offers", {
  id: uuid("id").defaultRandom().primaryKey(),
  quoteRequestId: uuid("quote_request_id").notNull().references(() => quoteRequests.id),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  catalogProductId: uuid("catalog_product_id").references(() => products.id),
  brand: varchar("brand", { length: 120 }).notNull(),
  productType: productType("product_type").notNull(),
  price: amount("price").notNull(),
  stock: integer("stock").notNull(),
  shippingInfo: varchar("shipping_info", { length: 250 }),
  preparationDays: integer("preparation_days"),
  validityUntil: timestamp("validity_until", { withTimezone: true }).notNull(),
  notes: text("notes"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("quote_offers_store_request_unique").on(t.storeId, t.quoteRequestId),
  index("quote_offers_request_idx").on(t.quoteRequestId),
  index("quote_offers_store_idx").on(t.storeId),
  index("quote_offers_status_idx").on(t.status),
  check("quote_offers_price_check", sql`${t.price} > 0 and ${t.stock} >= 0`),
]);

export const cartItems = pgTable("cart_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  storeProductId: uuid("store_product_id").references(() => storeProducts.id),
  quoteOfferId: uuid("quote_offer_id").references(() => quoteOffers.id),
  quantity: integer("quantity").default(1).notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("cart_items_user_idx").on(t.userId),
  uniqueIndex("cart_items_product_unique").on(t.userId, t.storeProductId),
  uniqueIndex("cart_items_quote_unique").on(t.userId, t.quoteOfferId),
  check("cart_items_source_check", sql`(${t.storeProductId} is not null) <> (${t.quoteOfferId} is not null)`),
  check("cart_items_qty_check", sql`${t.quantity} > 0`),
]);

export const favorites = pgTable("favorites", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("favorites_user_product_unique").on(t.userId, t.productId)]);

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNumber: varchar("order_number", { length: 30 }).notNull(),
  userId: uuid("user_id").notNull().references(() => users.id),
  total: amount("total").notNull(),
  shippingName: varchar("shipping_name", { length: 150 }).notNull(),
  shippingPhone: varchar("shipping_phone", { length: 30 }).notNull(),
  shippingCity: varchar("shipping_city", { length: 100 }).notNull(),
  shippingAddress: text("shipping_address").notNull(),
  paymentMethod: paymentMethod("payment_method").notNull(),
  status: varchar("status", { length: 25 }).default("awaiting_payment").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("orders_number_unique").on(t.orderNumber), index("orders_user_idx").on(t.userId)]);

export const storeOrders = pgTable("store_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  subtotal: amount("subtotal").notNull(),
  commissionTotal: amount("commission_total").notNull(),
  payoutAmount: amount("payout_amount").notNull(),
  status: varchar("status", { length: 25 }).default("awaiting_payment").notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("store_orders_store_idx").on(t.storeId), index("store_orders_order_idx").on(t.orderId)]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  storeOrderId: uuid("store_order_id").notNull().references(() => storeOrders.id),
  storeProductId: uuid("store_product_id").references(() => storeProducts.id),
  quoteOfferId: uuid("quote_offer_id").references(() => quoteOffers.id),
  productName: varchar("product_name", { length: 250 }).notNull(),
  oemNo: varchar("oem_no", { length: 100 }),
  brand: varchar("brand", { length: 120 }).notNull(),
  productType: productType("product_type").notNull(),
  sku: varchar("sku", { length: 120 }),
  unitPrice: amount("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
  lineTotal: amount("line_total").notNull(),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull(),
  commissionAmount: amount("commission_amount").notNull(),
  createdAt: createdAt(),
}, (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_store_order_idx").on(t.storeOrderId)]);

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  method: paymentMethod("method").notNull(),
  amount: amount("amount").notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  providerToken: text("provider_token"),
  providerPaymentId: text("provider_payment_id"),
  reference: varchar("reference", { length: 150 }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("payments_order_idx").on(t.orderId), uniqueIndex("payments_provider_token_unique").on(t.providerToken)]);

export const shipments = pgTable("shipments", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeOrderId: uuid("store_order_id").notNull().references(() => storeOrders.id),
  carrier: varchar("carrier", { length: 100 }).notNull(),
  trackingNumber: varchar("tracking_number", { length: 120 }).notNull(),
  status: varchar("status", { length: 25 }).default("shipped").notNull(),
  shippedAt: timestamp("shipped_at", { withTimezone: true }).defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
}, (t) => [index("shipments_store_order_idx").on(t.storeOrderId)]);

export const storeSalesInvoices = pgTable("store_sales_invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeOrderId: uuid("store_order_id").notNull().references(() => storeOrders.id),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  invoiceNumber: varchar("invoice_number", { length: 100 }).notNull(),
  pdfUrl: text("pdf_url"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("store_sales_invoice_order_unique").on(t.storeOrderId)]);

export const commissionRules = pgTable("commission_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id").references(() => stores.id),
  categoryId: uuid("category_id").references(() => categories.id),
  productId: uuid("product_id").references(() => products.id),
  rate: numeric("rate", { precision: 5, scale: 2 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: createdAt(),
}, (t) => [check("commission_rules_rate_check", sql`${t.rate} >= 0 and ${t.rate} <= 100`)]);

export const commissionTransactions = pgTable("commission_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeOrderId: uuid("store_order_id").notNull().references(() => storeOrders.id),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  amount: amount("amount").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  createdAt: createdAt(),
}, (t) => [index("commission_transactions_store_idx").on(t.storeId)]);

export const storeBalances = pgTable("store_balances", {
  storeId: uuid("store_id").primaryKey().references(() => stores.id),
  pendingAmount: amount("pending_amount").default("0.00").notNull(),
  availableAmount: amount("available_amount").default("0.00").notNull(),
  paidTotal: amount("paid_total").default("0.00").notNull(),
  commissionTotal: amount("commission_total").default("0.00").notNull(),
  refundTotal: amount("refund_total").default("0.00").notNull(),
  updatedAt: updatedAt(),
});

export const storeLedger = pgTable("store_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  storeOrderId: uuid("store_order_id").references(() => storeOrders.id),
  type: varchar("type", { length: 35 }).notNull(),
  amount: amount("amount").notNull(),
  description: text("description").notNull(),
  referenceKey: varchar("reference_key", { length: 180 }).notNull(),
  createdAt: createdAt(),
}, (t) => [index("store_ledger_store_idx").on(t.storeId), uniqueIndex("store_ledger_reference_unique").on(t.referenceKey)]);

export const storePayouts = pgTable("store_payouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  amount: amount("amount").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  bankReference: varchar("bank_reference", { length: 150 }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("store_payouts_store_idx").on(t.storeId)]);

export const commissionInvoices = pgTable("commission_invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeOrderId: uuid("store_order_id").notNull().references(() => storeOrders.id),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  amount: amount("amount").notNull(),
  invoiceNumber: varchar("invoice_number", { length: 100 }),
  pdfUrl: text("pdf_url"),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("commission_invoice_store_order_unique").on(t.storeOrderId)]);

export const csvImports = pgTable("csv_imports", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  totalRows: integer("total_rows").notNull(),
  importedRows: integer("imported_rows").notNull(),
  failedRows: integer("failed_rows").notNull(),
  report: jsonb("report"),
  createdAt: createdAt(),
}, (t) => [index("csv_imports_store_idx").on(t.storeId)]);

export const callRequests = pgTable("call_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").notNull().references(() => users.id),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  storeProductId: uuid("store_product_id").references(() => storeProducts.id),
  quoteRequestId: uuid("quote_request_id").references(() => quoteRequests.id),
  status: varchar("status", { length: 20 }).default("requested").notNull(),
  createdAt: createdAt(),
}, (t) => [index("call_requests_customer_idx").on(t.customerId), index("call_requests_store_idx").on(t.storeId)]);

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  callRequestId: uuid("call_request_id").notNull().references(() => callRequests.id),
  senderId: uuid("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: createdAt(),
}, (t) => [index("messages_call_idx").on(t.callRequestId)]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: createdAt(),
}, (t) => [index("audit_entity_idx").on(t.entityType, t.entityId)]);

export const platformSettings = pgTable("platform_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});
