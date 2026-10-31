/**
 * The small controls every screen shares.
 *
 * HeroUI is only imported in this folder, so a major version change is one
 * folder's problem, and each control is themed once in app.css.
 */

import {ListBox, Modal, Select as HeroSelect, Switch as HeroSwitch, Tooltip as HeroTooltip} from '@heroui/react'
import {ChevronDown} from 'lucide-react'
import type {ReactElement, ReactNode} from 'react'
import {isMac} from '../platform/window'
import {useSetting} from '../store/settings-store'

/** A hint on hover or focus. Pass `always` for what the Show help setting must not hide. */
export function Tooltip({
    text,
    always,
    placement = 'top',
    children,
}: {
    text: ReactNode
    always?: boolean
    placement?: 'top' | 'bottom' | 'left' | 'right'
    children: ReactElement
}) {
    const help = useSetting('helpOnHover')

    if (!text || (!help && !always)) {
        return children
    }

    return (
        <HeroTooltip delay={450} closeDelay={0}>
            <HeroTooltip.Trigger className="tooltip-trigger">{children}</HeroTooltip.Trigger>
            <HeroTooltip.Content placement={placement} offset={6} className="tooltip">
                {text}
            </HeroTooltip.Content>
        </HeroTooltip>
    )
}

export function Switch({
    label,
    value,
    onChange,
}: {
    label: string
    value: boolean
    onChange(value: boolean): void
}) {
    return (
        <HeroSwitch isSelected={value} onChange={onChange} aria-label={label} className="switch-control">
            <HeroSwitch.Content>
                <HeroSwitch.Control>
                    <HeroSwitch.Thumb />
                </HeroSwitch.Control>
            </HeroSwitch.Content>
        </HeroSwitch>
    )
}

export function Select<T extends string>({
    label,
    value,
    options,
    onChange,
    className,
}: {
    label: string
    value: T
    options: readonly {value: T; label: string}[]
    onChange(value: T): void
    className?: string
}) {
    return (
        <HeroSelect
            aria-label={label}
            value={value}
            onChange={(next) => {
                if (next !== null) {
                    onChange(next as T)
                }
            }}
            className={`select-control ${className ?? ''}`}
        >
            <HeroSelect.Trigger className="select-control__trigger">
                <HeroSelect.Value className="select-control__value" />
                <HeroSelect.Indicator>
                    <ChevronDown size={13} aria-hidden="true" />
                </HeroSelect.Indicator>
            </HeroSelect.Trigger>
            <HeroSelect.Popover className="menu-popover" placement="bottom start">
                <ListBox className="menu-list">
                    {options.map((option) => (
                        <ListBox.Item key={option.value} id={option.value} textValue={option.label} className="menu-item">
                            <span className="menu-item__label">{option.label}</span>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </HeroSelect.Popover>
        </HeroSelect>
    )
}

/** A modal panel. Focus stays inside it, and Esc or a click outside closes it. */
export function Dialog({
    open,
    onClose,
    label,
    title,
    width = 440,
    className,
    position = 'center',
    dismissable = true,
    children,
}: {
    open: boolean
    onClose(): void
    /** The accessible name, when there is no visible title. */
    label?: string
    title?: string
    width?: number
    className?: string
    position?: 'center' | 'top'
    dismissable?: boolean
    children: ReactNode
}) {
    return (
        <Modal.Backdrop
            isOpen={open}
            onOpenChange={(next) => {
                if (!next) {
                    onClose()
                }
            }}
            isDismissable={dismissable}
            isKeyboardDismissDisabled={!dismissable}
            className="dialog-backdrop"
            data-position={position}
        >
            <Modal.Container className="dialog-container" size="lg" placement={position === 'top' ? 'top' : 'center'}>
                <Modal.Dialog
                    className={`dialog ${className ?? ''}`}
                    style={{width: `min(${width}px, calc(100vw - 32px))`}}
                    aria-label={title ? undefined : label}
                >
                    {title ? (
                        <Modal.Heading slot="title" className="dialog__title">
                            {title}
                        </Modal.Heading>
                    ) : null}
                    {children}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    )
}

/** Keys, written the way the user presses them. */
export function Keys({keys}: {keys: string}) {
    return (
        <kbd className="keys">
            {keys.replace(/\+ $/, '+Space').replace('Ctrl', isMac() ? '⌘' : 'Ctrl')}
        </kbd>
    )
}
