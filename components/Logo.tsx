import { useMantineColorScheme } from '@mantine/core'
import { useMounted } from '@mantine/hooks'
import React from 'react'

interface LogoProps extends Omit<React.ComponentPropsWithoutRef<'img'>, 'src' | 'alt'> {
    variant?: 'full' | 'icon'
    height?: number | string
}

export function Logo({ variant = 'full', height = 30, style, ...props }: LogoProps) {
    const { colorScheme } = useMantineColorScheme()
    const isMounted = useMounted()

    let src = '/images/opengrades-text@2x.png'
    if (variant === 'icon') {
        src = '/images/splash-icon.png'
    } else if (isMounted && colorScheme === 'dark') {
        src = '/images/opengrades-white@2x.png'
    }

    return (
        <img
            src={src}
            alt={variant === 'icon' ? 'OG Logo' : 'OpenGrades'}
            height={height}
            style={{
                display: 'block',
                maxHeight: '100%',
                objectFit: 'contain',
                ...style,
            }}
            {...props}
        />
    )
}

export default Logo
