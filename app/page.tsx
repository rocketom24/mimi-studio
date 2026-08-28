export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center font-sans dark:bg-black">
      <h1 className="text-4xl font-semibold text-black dark:text-zinc-50">
        Mimi Studio
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        An interactive portfolio by Mimi.
      </p>
      <p className="text-sm text-zinc-400 dark:text-zinc-600">
        Game initialization coming soon.
      </p>
    </div>
  );
}
