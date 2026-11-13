import { ShareIcon } from '@heroicons/react/20/solid'
import { useInstallPrompt } from './install.ts'

/** The install control: step-by-step help on iOS, an "Install App Now" button where the browser allows it, else a hint. */
export function InstallPrompt() {
  const { canPrompt, prompt } = useInstallPrompt()
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)

  if (ios) {
    return (
      <div className="rounded-lg border-2 border-primary/20 bg-primary/10 p-4">
        <p className="mb-3 text-center text-sm font-semibold text-gray-800">To install on iPhone/iPad:</p>
        <ol className="space-y-2 text-left text-sm text-gray-700">
          <li className="flex items-start">
            <span className="mr-2 font-bold">1.</span>
            <span>Tap the <strong>Share</strong> button <ShareIcon className="mx-1 inline-block h-4 w-4" /> at the bottom of your screen</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2 font-bold">2.</span>
            <span>Scroll down and tap <strong>"Add to Home Screen"</strong></span>
          </li>
          <li className="flex items-start">
            <span className="mr-2 font-bold">3.</span>
            <span>Tap <strong>"Add"</strong> in the top right corner</span>
          </li>
        </ol>
      </div>
    )
  }

  if (canPrompt) {
    return (
      <button onClick={() => void prompt()} className="w-full rounded-lg bg-primary px-6 py-4 text-lg font-bold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90">
        Install App Now
      </button>
    )
  }

  return (
    <div className="rounded-lg border-2 border-yellow-200 bg-yellow-50 p-4">
      <p className="text-center text-sm text-gray-700">
        <span className="font-semibold">Please check if the app is installed on your phone.</span><br />
        <span className="font-semibold">It may take time to install if you've clicked on "Install App"</span><br />
        Please use Chrome, Edge, or Safari to install this app.
      </p>
    </div>
  )
}
