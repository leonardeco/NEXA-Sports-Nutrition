import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

test.describe("degradación y accesibilidad (RNF-03, RNF-06)", () => {
  test("la tienda se navega y WhatsApp está a la vista sin Wompi", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.getByRole("link", { name: /WhatsApp/i }).first()).toBeVisible()

    await page.getByRole("link", { name: "Ver catálogo" }).first().click()
    await expect(page).toHaveURL(/\/catalogo/)
    await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible()
  })

  test("portada y catálogo no tienen violaciones axe graves", async ({ page }) => {
    for (const path of ["/", "/catalogo"]) {
      await page.goto(path)
      const results = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze()
      const graves = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      )
      expect(graves, `${path}: ${graves.map((v) => v.id).join(", ")}`).toEqual([])
    }
  })
})
