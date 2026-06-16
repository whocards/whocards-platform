import gsap from 'gsap'
// @ts-ignore
import * as SplitText from 'split-text-js'

const rotateText = () => {
  const words = gsap.utils.toArray<HTMLSpanElement>('.rotate')

  gsap.set(words, {visibility: 'visible'})

  const tl = gsap.timeline({repeat: -1}).timeScale(0.4)

  words.forEach((word) => {
    word.classList.remove('hidden')

    const title = new SplitText(word)

    tl.from(
      title.chars,
      {
        opacity: 0,
        y: 80,
        rotateX: -90,
        stagger: 0.04,
      },
      '<'
    ).to(
      title.chars,
      {
        opacity: 0,
        y: -80,
        rotateX: 90,
        stagger: 0.04,
      },
      '<1'
    )
  })
}

export default rotateText
