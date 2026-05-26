import { AppNav } from "@/components/layout/app-nav";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <AppNav />
      {children}
    </>
  );
}
