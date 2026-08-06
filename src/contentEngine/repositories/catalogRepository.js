const path = require("path");
const { getSupabaseAdminClient, hasSupabaseConfiguration } = require("../db/supabaseClient");
const { JsonDocumentStore, clone } = require("./jsonDocumentStore");

const PRODUCT_STATUSES = Object.freeze([
    "AVAILABLE",
    "LOW_STOCK",
    "OUT_OF_STOCK",
    "PAUSED",
    "ARCHIVED"
]);

const SEED_PRODUCTS = Object.freeze([{
    reference: "LLV-024",
    name: "Llavero personalizado con nombre",
    category: "Llaveros",
    description: "Llavero personalizado de hasta cuatro colores.",
    compatibleColors: [
        "Negro", "Blanco", "Gris", "Gris oscuro", "Rosa",
        "Turquesa", "Verde brillante", "Verde bambú", "Café"
    ],
    materials: ["PLA"],
    variants: [],
    sizes: [{ label: "Base", widthCm: 6 }],
    priceFrom: 2.5,
    fixedPrice: null,
    priceConfirmedAt: "2026-08-06T00:00:00.000Z",
    estimatedMinutes: null,
    availabilityStatus: "AVAILABLE",
    soldCount: 0,
    inquiryCount: 0,
    popularityScore: 0,
    estimatedMargin: null,
    lastPublishedAt: null,
    publicationCount: 0,
    promotionBlockedUntil: null,
    stlStoragePath: null,
    metadata: { maxColors: 4, source: "verified_business_context" }
}]);

function toProduct(row) {
    if (!row) return null;
    return {
        id: row.id || null,
        reference: row.reference,
        name: row.name,
        category: row.category,
        description: row.description || "",
        compatibleColors: row.compatible_colors || row.compatibleColors || [],
        materials: row.materials || [],
        variants: row.variants || [],
        sizes: row.sizes || [],
        priceFrom: row.price_from ?? row.priceFrom ?? null,
        fixedPrice: row.fixed_price ?? row.fixedPrice ?? null,
        priceConfirmedAt: row.price_confirmed_at || row.priceConfirmedAt || null,
        estimatedMinutes: row.estimated_minutes ?? row.estimatedMinutes ?? null,
        availabilityStatus: row.availability_status || row.availabilityStatus,
        soldCount: row.sold_count ?? row.soldCount ?? 0,
        inquiryCount: row.inquiry_count ?? row.inquiryCount ?? 0,
        popularityScore: row.popularity_score ?? row.popularityScore ?? 0,
        estimatedMargin: row.estimated_margin ?? row.estimatedMargin ?? null,
        lastPublishedAt: row.last_published_at || row.lastPublishedAt || null,
        publicationCount: row.publication_count ?? row.publicationCount ?? 0,
        promotionBlockedUntil: row.promotion_blocked_until || row.promotionBlockedUntil || null,
        stlStoragePath: row.stl_storage_path || row.stlStoragePath || null,
        metadata: row.metadata || {}
    };
}

function assertReference(reference) {
    const normalized = String(reference || "").trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(normalized)) {
        throw Object.assign(new Error("Referencia de producto inválida."), {
            statusCode: 400,
            code: "INVALID_PRODUCT_REFERENCE"
        });
    }
    return normalized;
}

class FileCatalogRepository {
    constructor(filePath = path.resolve(
        process.env.CONTENT_ENGINE_WORK_DIR || "./storage/work",
        "catalog.json"
    )) {
        this.store = new JsonDocumentStore(filePath, { products: clone(SEED_PRODUCTS) });
    }

    async list(filters = {}) {
        const document = await this.store.read();
        const search = String(filters.search || "").trim().toLocaleLowerCase("es");
        const status = filters.availabilityStatus || null;
        const now = Date.now();
        const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);

        return document.products
            .map(toProduct)
            .filter(product => !search || [
                product.reference,
                product.name,
                product.category
            ].some(value => String(value).toLocaleLowerCase("es").includes(search)))
            .filter(product => !status || product.availabilityStatus === status)
            .filter(product => !filters.promotableOnly || (
                ["AVAILABLE", "LOW_STOCK"].includes(product.availabilityStatus) &&
                (!product.promotionBlockedUntil || Date.parse(product.promotionBlockedUntil) <= now)
            ))
            .slice(0, limit);
    }

    async getByReference(reference) {
        const normalized = assertReference(reference);
        const products = await this.list({ limit: 100 });
        return products.find(product => product.reference === normalized) || null;
    }

    async update(reference, changes) {
        const normalized = assertReference(reference);
        let updated = null;
        await this.store.update(document => {
            const index = document.products.findIndex(product => product.reference === normalized);
            if (index < 0) {
                throw Object.assign(new Error("Producto no encontrado."), {
                    statusCode: 404,
                    code: "PRODUCT_NOT_FOUND"
                });
            }
            document.products[index] = { ...document.products[index], ...changes };
            updated = toProduct(document.products[index]);
        });
        return updated;
    }
}

class SupabaseCatalogRepository {
    constructor(client = getSupabaseAdminClient()) {
        this.client = client;
    }

    async list(filters = {}) {
        const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
        let query = this.client.from("products").select("*").order("updated_at", { ascending: false }).limit(limit);
        if (filters.availabilityStatus) {
            query = query.eq("availability_status", filters.availabilityStatus);
        }
        if (filters.promotableOnly) {
            query = query.in("availability_status", ["AVAILABLE", "LOW_STOCK"])
                .or(`promotion_blocked_until.is.null,promotion_blocked_until.lte.${new Date().toISOString()}`);
        }
        const { data, error } = await query;
        if (error) throw new Error(`No se pudo consultar el catálogo: ${error.message}`);

        const search = String(filters.search || "").trim().toLocaleLowerCase("es");
        return (data || []).map(toProduct).filter(product => !search || [
            product.reference,
            product.name,
            product.category
        ].some(value => String(value).toLocaleLowerCase("es").includes(search)));
    }

    async getByReference(reference) {
        const normalized = assertReference(reference);
        const { data, error } = await this.client.from("products")
            .select("*").eq("reference", normalized).maybeSingle();
        if (error) throw new Error(`No se pudo leer el producto: ${error.message}`);
        return toProduct(data);
    }

    async update(reference, changes) {
        const normalized = assertReference(reference);
        const mapping = {
            availabilityStatus: "availability_status",
            promotionBlockedUntil: "promotion_blocked_until",
            inquiryCount: "inquiry_count",
            lastPublishedAt: "last_published_at",
            publicationCount: "publication_count"
        };
        const update = {};
        for (const [key, value] of Object.entries(changes)) {
            update[mapping[key] || key] = value;
        }
        const { data, error } = await this.client.from("products")
            .update(update).eq("reference", normalized).select("*").maybeSingle();
        if (error) throw new Error(`No se pudo actualizar el producto: ${error.message}`);
        if (!data) {
            throw Object.assign(new Error("Producto no encontrado."), {
                statusCode: 404,
                code: "PRODUCT_NOT_FOUND"
            });
        }
        return toProduct(data);
    }
}

function createCatalogRepository() {
    return hasSupabaseConfiguration()
        ? new SupabaseCatalogRepository()
        : new FileCatalogRepository();
}

module.exports = {
    PRODUCT_STATUSES,
    SEED_PRODUCTS,
    FileCatalogRepository,
    SupabaseCatalogRepository,
    createCatalogRepository,
    assertReference,
    toProduct
};
