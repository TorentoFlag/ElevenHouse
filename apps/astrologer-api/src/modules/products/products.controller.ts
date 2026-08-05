import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { PlatformTariffCapabilityGuard } from "../platform-entitlements/platform-tariff-capability.guard";
import { RequirePlatformTariffCapability } from "../platform-entitlements/platform-tariff-capability.policy";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { ProductsService } from "./products.service";

@Controller("products")
@UseGuards(AstrologerSessionAuthGuard, PlatformTariffCapabilityGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @RequirePlatformTariffCapability({
    surfaceId: "products.list",
    capability: "products",
    operation: "read"
  })
  listProducts(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.productsService.listProducts(query, request);
  }

  @Get("summary")
  @RequirePlatformTariffCapability({
    surfaceId: "products.summary",
    capability: "products",
    operation: "read"
  })
  getSummary(@Req() request: AstrologerSessionRequest) {
    return this.productsService.getSummary(request);
  }

  @Get("templates")
  @RequirePlatformTariffCapability({
    surfaceId: "products.templates",
    capability: "products",
    operation: "read"
  })
  listProductTemplates(@Query() query: unknown) {
    return this.productsService.listProductTemplates(query);
  }

  @Post("templates/:templateCode/drafts")
  @RequirePlatformTariffCapability({
    surfaceId: "products.template-draft.create",
    capability: "products",
    operation: "mutation"
  })
  @RequireCsrf()
  createProductFromTemplate(
    @Param("templateCode") templateCode: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.productsService.createProductFromTemplate(templateCode, body, request);
  }

  @Get(":productId")
  @RequirePlatformTariffCapability({
    surfaceId: "products.read",
    capability: "products",
    operation: "read"
  })
  getProduct(@Param("productId") productId: string, @Req() request: AstrologerSessionRequest) {
    return this.productsService.getProduct(productId, request);
  }

  @Post()
  @RequirePlatformTariffCapability({
    surfaceId: "products.create",
    capability: "products",
    operation: "mutation"
  })
  @RequireCsrf()
  createProduct(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.productsService.createProduct(body, request);
  }

  @Put(":productId")
  @RequirePlatformTariffCapability({
    surfaceId: "products.update",
    capability: "products",
    operation: "mutation"
  })
  @RequireCsrf()
  updateProduct(
    @Param("productId") productId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.productsService.updateProduct(productId, body, request);
  }

  @Post(":productId/publish")
  @RequirePlatformTariffCapability({
    surfaceId: "products.publish",
    capability: "products",
    operation: "mutation"
  })
  @RequireCsrf()
  publishProduct(@Param("productId") productId: string, @Req() request: AstrologerSessionRequest) {
    return this.productsService.publishProduct(productId, request);
  }

  @Post(":productId/move-to-draft")
  @RequirePlatformTariffCapability({
    surfaceId: "products.move-to-draft",
    capability: "products",
    operation: "mutation"
  })
  @RequireCsrf()
  moveProductToDraft(
    @Param("productId") productId: string,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.productsService.moveProductToDraft(productId, request);
  }

  @Post(":productId/archive")
  @RequirePlatformTariffCapability({
    surfaceId: "products.archive",
    capability: "products",
    operation: "mutation"
  })
  @RequireCsrf()
  archiveProduct(@Param("productId") productId: string, @Req() request: AstrologerSessionRequest) {
    return this.productsService.archiveProduct(productId, request);
  }

  @Post(":productId/duplicate")
  @RequirePlatformTariffCapability({
    surfaceId: "products.duplicate",
    capability: "products",
    operation: "mutation"
  })
  @RequireCsrf()
  duplicateProduct(
    @Param("productId") productId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.productsService.duplicateProduct(productId, body, request);
  }
}
