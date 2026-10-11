import * as React from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 xl:p-8", className)}>
      {children}
    </div>
  );
}
