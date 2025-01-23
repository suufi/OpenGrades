import { ActionIcon, Loader, MultiSelect } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { IconRefresh } from '@tabler/icons'
import { useCallback, useEffect, useState } from 'react'
import { IClass } from '../types'

type State = {
    data: { value: string; label: string }[]
    status: 'initial' | 'loading' | 'error' | 'success'
}

type FormValues = {
    classes: { [key: string]: string[] },
    flatClasses: string[]
}

export default function ClassSearch ({ form, display, term }: { form: UseFormReturnType<FormValues>, display: string, term: string }) {
    const [{ status, data }, setState] = useState<State>({
        data: [],
        status: 'initial'
    })

    const fetchData = useCallback(async () => {
        try {
            setState(oldState => {
                return {
                    ...oldState,
                    status: 'loading'
                }
            })

            // Fetch all classes for the given term
            const response = await fetch(`/api/classes?term=${term}&all=true&reviewable=true`)
            const { data } = await response.json()

            setState({
                data: data.map((classEntry: IClass) => {
                    const aliases = (classEntry.aliases && classEntry.aliases.length > 0) ? ` aka ${classEntry.aliases.join(", ")} ` : " "
                    return {
                        value: classEntry._id,
                        label: `${classEntry.subjectNumber}${aliases}(${classEntry.instructors.join(', ')})`
                    }
                }),
                status: 'success'
            })
        } catch (error) {
            console.error(error)

            setState(oldState => {
                return {
                    ...oldState,
                    status: 'error'
                }
            })
        }
    }, [term])

    useEffect(() => {
        fetchData()
        // Merge fetched classes with existing form values
        form.setValues((prevValues) => ({
            ...prevValues,
            classes: {
                ...prevValues.classes,
                [term]: prevValues.classes[term] || [],
            },
        }))
    }, [term])



    useEffect(() => {
        if (status === 'initial') fetchData()
    }, [status, fetchData])

    if (status === 'initial' || status === 'loading') {
        return (
            <MultiSelect
                data={[]}
                disabled
                {...form.getInputProps(`classes.${term}`)}
                rightSection={<Loader size={20} />}
            />
        )
    }

    return (
        <>
            <MultiSelect
                data={data}
                searchable
                placeholder={`Select the classes you took in ${display}`}
                nothingFoundMessage={
                    status === 'error'
                        ? 'There was an error loading the data. Click refresh icon to try again.'
                        : 'Nothing found'
                }
                maxDropdownHeight={150}
                limit={20}
                {...form.getInputProps(`classes.${term}`)}
                value={form.values.classes[term]}
                defaultValue={form.values.classes[term]}

                rightSection={
                    status === 'error' && (
                        <ActionIcon onClick={fetchData}>
                            <IconRefresh size={20} />
                        </ActionIcon>
                    )
                }
            />
        </>
    )
}