import { ActionIcon, Loader, MultiSelect } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { IconRefresh } from '@tabler/icons-react'
import { useEffect } from 'react'
import { useClasses } from '@/lib/query'

type FormWithClasses = { classes: Record<string, string[]> }

export default function ClassSearch<T extends FormWithClasses>({ form, display, term }: { form: UseFormReturnType<T>; display: string; term: string }) {
    const { data, isLoading, isError, refetch, isFetching } = useClasses({
        term,
        all: 'true',
        reviewable: 'true',
    }, !!term)

    const classOptions = (data?.data ?? []).map((classEntry) => {
        const aliases = (classEntry.aliases && classEntry.aliases.length > 0) ? ` aka ${classEntry.aliases.join(', ')} ` : ' '
        return {
            value: classEntry._id,
            label: `${classEntry.subjectNumber}${aliases}(${classEntry.instructors.join(', ')})`
        }
    })

    useEffect(() => {
        form.setValues((prevValues) => {
            if (prevValues.classes && prevValues.classes[term]) {
                return prevValues
            }
            return {
                ...prevValues,
                classes: {
                    ...prevValues.classes,
                    [term]: [],
                },
            } as Partial<T>
        })
    }, [term])

    if (isLoading || (isFetching && classOptions.length === 0)) {
        return (
            <MultiSelect
                data={[]}
                disabled
                {...form.getInputProps(`classes.${term}`)}
                rightSection={<Loader size={20} />}
            />
        )
    }

    if (isError) {
        return (
            <MultiSelect
                data={[]}
                disabled
                {...form.getInputProps(`classes.${term}`)}
                rightSection={
                    <ActionIcon onClick={() => refetch()} variant="subtle">
                        <IconRefresh size={16} />
                    </ActionIcon>
                }
            />
        )
    }

    return (
        <MultiSelect
            data={classOptions}
            searchable
            {...form.getInputProps(`classes.${term}`)}
            rightSection={
                isFetching
                    ? <Loader size={20} />
                    : (
                        <ActionIcon onClick={() => refetch()} variant="subtle">
                            <IconRefresh size={16} />
                        </ActionIcon>
                    )
            }
        />
    )
}
