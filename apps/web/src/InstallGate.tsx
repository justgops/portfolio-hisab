import { InstallPrompt } from './InstallPrompt.tsx'
import { APP_NAME, APP_VERSION } from './version.ts'

/** Full-screen "install first" page shown instead of the app in a phone browser, as in fabric-costing-lite. */
export function InstallGate() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-primary to-primary/80 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 text-center shadow-2xl">
          <img src="/icon.svg" alt="" className="mx-auto mb-3 h-16 w-16 rounded-2xl" />
          <h1 className="mb-2 text-2xl font-bold text-gray-800">{APP_NAME}</h1>
          <p className="text-gray-600">Version {APP_VERSION}</p>
          <p className="mb-6 text-gray-600">
            For the best experience, please install this app on your device. Click the button below to get started.
          </p>
          <InstallPrompt />
          <div className="mt-6 text-sm text-gray-500">
            <p className="mb-2 font-semibold">After installing:</p>
            <ul className="list-inside list-disc space-y-1 text-left">
              <li>Works 100% offline</li>
              <li>Fast and reliable</li>
              <li>Saves data locally</li>
              <li>No internet required</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
