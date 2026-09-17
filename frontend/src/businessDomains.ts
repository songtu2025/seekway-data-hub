const businessDomainNames: Record<string, string> = {
  middle: "基础资料",
  fulfillment: "仓储物流",
  purchase: "采购与商品库存",
  platform: "多平台管理",
  operation: "运营管理",
  finance: "财务管理",
  sales: "销售管理",
  inventory: "库存管理",
  replace: "示例接口",
  other: "其他业务",
};

interface BusinessDomainSource {
  domain: string;
  officialDomain?: string | null;
}

export function businessDomainKey(item: BusinessDomainSource): string {
  return item.officialDomain?.trim() || item.domain;
}

export function businessDomainLabel(domain: string): string {
  return businessDomainNames[domain] ?? (/[\u3400-\u9fff]/.test(domain) ? domain : "未分类业务");
}
