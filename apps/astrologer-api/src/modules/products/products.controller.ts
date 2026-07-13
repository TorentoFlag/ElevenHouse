import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { ProductsService } from "./products.service";

@Controller("products")
@UseGuards(AstrologerSessionAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  listProducts(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.productsService.listProducts(query, request);
  }

  @Get("summary")
  getSummary(@Req() request: AstrologerSessionRequest) {
    return this.productsService.getSummary(request);
  }

  @Get("templates")
  listProductTemplates(@Query() query: unknown) {
    return this.productsService.listProductTemplates(query);
  }

  @Post("templates/:templateCode/drafts")
  @RequireCsrf()
  createProductFromTemplate(
    @Param("templateCode") templateCode: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.productsService.createProductFromTemplate(templateCode, body, request);
  }

  @Get(":productId")
  getProduct(@Param("productId") productId: string, @Req() request: AstrologerSessionRequest) {
    return this.productsService.getProduct(productId, request);
  }

  @Post()
  @RequireCsrf()
  createProduct(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.productsService.createProduct(body, request);
  }

  @Put(":productId")
  @RequireCsrf()
  updateProduct(
    @Param("productId") productId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.productsService.updateProduct(productId, body, request);
  }

  @Post(":productId/publish")
  @RequireCsrf()
  publishProduct(@Param("productId") productId: string, @Req() request: AstrologerSessionRequest) {
    return this.productsService.publishProduct(productId, request);
  }

  @Post(":productId/move-to-draft")
  @RequireCsrf()
  moveProductToDraft(
    @Param("productId") productId: string,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.productsService.moveProductToDraft(productId, request);
  }

  @Post(":productId/archive")
  @RequireCsrf()
  archiveProduct(@Param("productId") productId: string, @Req() request: AstrologerSessionRequest) {
    return this.productsService.archiveProduct(productId, request);
  }

  @Post(":productId/duplicate")
  @RequireCsrf()
  duplicateProduct(
    @Param("productId") productId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.productsService.duplicateProduct(productId, body, request);
  }
}
