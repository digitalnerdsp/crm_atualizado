import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";

type AuthLayoutProps = {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
};

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="h-svh w-full overflow-y-auto bg-background flex flex-col items-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-sm space-y-4 my-auto">
        <img
          src="/logo-digital-nerd.png"
          alt="Digital Nerd"
          width={256}
          height={92}
          className="mx-auto mb-6 h-20 w-auto select-none sm:h-24"
          draggable={false}
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-center text-xl font-bold">
              {title}
            </CardTitle>
            {subtitle ? (
              <CardDescription className="text-center">
                {subtitle}
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="pt-0">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
