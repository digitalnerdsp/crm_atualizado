export function DemoAlert() {
  return (
    <div className="sticky top-0 left-0 right-0 flex flex-col border-warning/30 border-b bg-warning/10 px-4 py-3 text-center">
      <div className="flex flex-col items-center justify-center gap-2 text-sm text-warning-foreground sm:flex-row">
        <p className="flex flex-col sm:flex-row items-center gap-2">
          This is a demo environment. All data will be automatically purged
          every hour.
        </p>
      </div>
    </div>
  );
}
