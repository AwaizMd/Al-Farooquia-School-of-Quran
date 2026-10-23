import { t } from "../../i18n/I18nProvider"
import { Component } from 'react'

// Keeps a rendering error on one page from blanking the whole demo.
export default class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('Page error', error, info) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card mx-auto max-w-md p-6 text-center">
        <p className="font-bold text-forest">{t("Something went wrong on this page")}</p>
        <p className="mt-1 text-[13.5px] text-ink-muted">{t("Your demo data is safe. Try going back, or reset the demo from Demo Mode if the problem continues.")}</p>
        <button type="button" onClick={() => { this.setState({ error: null }); window.location.assign('/dashboard') }} className="mt-4 min-h-[44px] rounded-xl bg-primary-700 px-4 font-semibold text-white">{t("Back to dashboard")}</button>
      </div>
    )
  }
}
