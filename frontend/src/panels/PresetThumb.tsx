import {useEffect, useRef, useState} from 'react'
import {PresetIcon} from './PresetIcon'
import {useSetting} from '../store/settings-store'
import {presetThumbnail, requestPresetThumbnail} from './preset-thumbnails'

/** A card's picture, drawn once the card comes on screen. Its icon stands in until then. */
export function PresetThumb({presetId}: {presetId: string}) {
    const [picture, setPicture] = useState(() => presetThumbnail(presetId))
    const box = useRef<HTMLDivElement>(null)
    const pictures = useSetting('presetThumbnails') === true

    useEffect(() => {
        const element = box.current

        if (picture || !element || !pictures) {
            return
        }

        let withdraw: (() => void) | undefined
        const watcher = new IntersectionObserver(([entry]) => {
            withdraw?.()
            withdraw = entry.isIntersecting ? requestPresetThumbnail(presetId, setPicture) : undefined
        })

        watcher.observe(element)

        return () => {
            watcher.disconnect()
            withdraw?.()
        }
    }, [picture, presetId, pictures])

    return (
        <div className="preset-card__thumb" ref={box} data-pictured={picture && pictures ? true : undefined}>
            {picture && pictures ? <img src={picture} alt="" draggable={false} /> : <PresetIcon presetId={presetId} />}
        </div>
    )
}
