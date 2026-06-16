// copied with love from https://github.com/ellisonleao/sharer.js/blob/main/sharer.js
export type Social = 'facebook' | 'linkedin' | 'twitter' | 'email' | 'copy'

type SocialKey = Exclude<Social, 'copy'>

const urls: Record<SocialKey, string> = {
  facebook: 'https://www.facebook.com/sharer/sharer.php?u={URL}&quote={TITLE}',
  linkedin: 'https://www.linkedin.com/shareArticle?mini=true&url={URL}',
  twitter: 'https://twitter.com/intent/tweet?url={URL}&text={TITLE}',
  email: 'mailto:?subject={TITLE}&body={URL}',
}

export const socialShare = (social: Social | string | undefined, title: string, url: string) => {
  // handle invalid social
  if (!social || (!urls[social as SocialKey] && social !== 'copy')) {
    console.error(social, 'is not supported')
    return
  }

  if (social === 'copy') {
    navigator.clipboard.writeText(url)
  } else {
    // create share url
    const shareUrl = urls[social as SocialKey]
      .replace('{URL}', encodeURIComponent(url))
      .replace('{TITLE}', encodeURIComponent(title))

    if (social === 'email') {
      window.open(shareUrl, '_blank')
    }

    // create popup params
    const popWidth = 600
    const popHeight = 480
    const left = window.innerWidth / 2 - popWidth / 2 + window.screenX
    const top = window.innerHeight / 2 - popHeight / 2 + window.screenY
    const popParams = `scrollbars=no, width=${popWidth}, height=${popHeight}, top=${top}, left=${left}`
    // create and focus popup window
    const newWindow = window.open(shareUrl, '', popParams)
    newWindow?.focus()
  }
}
