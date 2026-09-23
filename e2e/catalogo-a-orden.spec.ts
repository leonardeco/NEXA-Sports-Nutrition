import { expect, test } from "@playwright/test"

test.describe("catálogo → carrito → pedido (constitución 5)", () => {
  test("un cliente arma un pedido desde el catálogo", async ({ page }) => {
    await page.goto("/catalogo")
    await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible()

    const producto = page.locator("article").filter({ hasNotText: "Agotado" }).first()
    await expect(producto).toBeVisible()
    await producto.getByRole("link").first().click()

    await expect(page.getByRole("button", { name: "Añadir al carrito" })).toBeVisible()
    await page.getByRole("button", { name: "Añadir al carrito" }).click()
    await expect(page.getByRole("status")).toContainText(/Añadido|Solo quedan/)

    await page.getByRole("link", { name: /Carrito/ }).click()
    await expect(page.getByRole("heading", { name: "Tu carrito" })).toBeVisible()

    await page.getByLabel("Nombre completo").fill("Ana Gómez")
    await page.getByLabel("Teléfono").fill("3226993891")
    await page.getByLabel("Correo electrónico").fill("ana@example.com")
    await page.getByLabel("Ciudad").fill("Bogotá")
    await page.getByLabel("Dirección").fill("Calle 1 # 2-3")
    await page.getByRole("button", { name: "Confirmar pedido" }).click()

    await expect(page).toHaveURL(/\/orden\//, { timeout: 20_000 })
    await expect(page.getByRole("heading", { name: /pedido/i })).toBeVisible()

    const referencia = page.getByText(/NEXA-\d{6}-[A-Z0-9]+/).first()
    await expect(referencia).toBeVisible()
    const numero = (await referencia.textContent())?.match(/NEXA-\d{6}-[A-Z0-9]+/)?.[0]
    expect(numero).toBeTruthy()

    // Por nombre exacto: /WhatsApp/i tambien casa con el enlace del pie y
    // con el boton flotante, y Playwright aborta por locator ambiguo.
    const coordinarPago = page.getByRole("link", { name: "Coordinar el pago por WhatsApp" })
    await expect(coordinarPago).toBeVisible()

    // El mensaje tiene que llevar la referencia: sin ella, al asesor le
    // llega un pedido que no puede cruzar con ninguna orden.
    await expect(coordinarPago).toHaveAttribute("href", new RegExp(numero!))
  })
})
