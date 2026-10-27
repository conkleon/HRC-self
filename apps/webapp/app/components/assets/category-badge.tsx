import type { Category } from "@prisma/client";
import { useTranslation } from "react-i18next";
import { Badge } from "../shared/badge";

export function CategoryBadge({
  category,
  className,
}: {
  category: Pick<Category, "id" | "name" | "color"> | null;
  className?: string;
}) {
  const { t } = useTranslation();
  return category ? (
    <Badge color={category.color} withDot={false} className={className}>
      {category.name}
    </Badge>
  ) : (
    <Badge color="#575757" withDot={false} className={className}>
      {t("assets.categoryBadge.uncategorized")}
    </Badge>
  );
}
