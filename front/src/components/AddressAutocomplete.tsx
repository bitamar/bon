import React, { useRef, useState } from 'react';
import { Box, Combobox, Group, Loader, Stack, TextInput, useCombobox } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { fetchAllCities, fetchAllStreetsForCity, filterOptions } from '../api/address';

export interface AddressFormAdapter {
  getInputProps: (field: 'city' | 'streetAddress' | 'postalCode') => {
    error?: React.ReactNode;
    value?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  };
  setFieldValue: (field: 'city' | 'streetAddress' | 'postalCode', value: string) => void;
}

interface AddressAutocompleteProps {
  form: AddressFormAdapter;
  disabled?: boolean;
  initialCity?: string;
  initialStreetAddress?: string;
  required?: boolean;
}

const MAX_DROPDOWN_ITEMS = 20;

function buildStreetAddress(streetName: string, houseNumber: string, aptDetails: string): string {
  const base = houseNumber ? `${streetName} ${houseNumber}` : streetName;
  return aptDetails ? `${base}, ${aptDetails}` : base;
}

export function AddressAutocomplete({
  form,
  disabled,
  initialCity = '',
  initialStreetAddress = '',
  required = true,
}: Readonly<AddressAutocompleteProps>) {
  const [cityQuery, setCityQuery] = useState(initialCity);
  const [selectedCityCode, setSelectedCityCode] = useState<string | null>(null);
  // Street is split into three sub-fields, all combined into form.streetAddress
  const [streetName, setStreetName] = useState(initialStreetAddress);
  const [houseNumber, setHouseNumber] = useState('');
  const [aptDetails, setAptDetails] = useState('');
  // After selecting a street option, Mantine refocuses the TextInput which would reopen the
  // dropdown. This ref suppresses that one spurious onFocus-triggered open.
  const suppressNextStreetOpen = useRef(false);

  const cityCombobox = useCombobox({ onDropdownClose: () => cityCombobox.resetSelectedOption() });
  const streetCombobox = useCombobox({
    onDropdownClose: () => streetCombobox.resetSelectedOption(),
  });

  const { data: allCities = [], isFetching: citiesLoading } = useQuery({
    queryKey: ['address', 'cities'],
    queryFn: fetchAllCities,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const { data: allStreets = [], isFetching: streetsLoading } = useQuery({
    queryKey: ['address', 'streets', selectedCityCode],
    queryFn: () => fetchAllStreetsForCity(selectedCityCode ?? ''),
    enabled: selectedCityCode !== null,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const filteredCities = filterOptions(allCities, cityQuery).slice(0, MAX_DROPDOWN_ITEMS);
  const filteredStreets = filterOptions(allStreets, streetName).slice(0, MAX_DROPDOWN_ITEMS);

  const cityInputProps = form.getInputProps('city');
  const streetInputProps = form.getInputProps('streetAddress');
  const postalInputProps = form.getInputProps('postalCode');

  const fieldsDisabled = disabled === true || selectedCityCode === null;

  const resetStreet = () => {
    setStreetName('');
    setHouseNumber('');
    setAptDetails('');
    form.setFieldValue('streetAddress', '');
  };

  let cityDropdownContent: React.ReactNode = null;
  if (filteredCities.length > 0) {
    cityDropdownContent = filteredCities.map((option) => (
      <Combobox.Option key={option.code} value={option.name}>
        {option.name}
      </Combobox.Option>
    ));
  } else if (cityQuery.length > 0 && !citiesLoading) {
    cityDropdownContent = <Combobox.Empty>לא נמצאו תוצאות</Combobox.Empty>;
  }

  let streetDropdownContent: React.ReactNode = null;
  if (streetsLoading) {
    streetDropdownContent = <Combobox.Empty>טוען רחובות...</Combobox.Empty>;
  } else if (filteredStreets.length > 0) {
    streetDropdownContent = filteredStreets.map((option) => (
      <Combobox.Option key={option.name} value={option.name}>
        {option.name}
      </Combobox.Option>
    ));
  } else if (streetName.length > 0) {
    streetDropdownContent = <Combobox.Empty>לא נמצאו תוצאות</Combobox.Empty>;
  }

  return (
    <Stack gap="sm">
      {/* City — select first */}
      <Combobox
        store={cityCombobox}
        onOptionSubmit={(val) => {
          const city = allCities.find((c) => c.name === val);
          if (city) {
            form.setFieldValue('city', city.name);
            setCityQuery(city.name);
            setSelectedCityCode(city.code);
            resetStreet();
          }
          cityCombobox.closeDropdown();
        }}
      >
        <Combobox.Target>
          <TextInput
            label="עיר / ישוב"
            required={required}
            placeholder="הקלד שם עיר..."
            value={cityQuery}
            onChange={(e) => {
              const value = e.target.value;
              setCityQuery(value);
              form.setFieldValue('city', value);
              if (selectedCityCode !== null) {
                setSelectedCityCode(null);
                resetStreet();
              }
              cityCombobox.openDropdown();
            }}
            onFocus={() => cityCombobox.openDropdown()}
            onBlur={() => cityCombobox.closeDropdown()}
            rightSection={citiesLoading ? <Loader size={16} /> : null}
            disabled={disabled === true}
            error={cityInputProps.error}
          />
        </Combobox.Target>
        <Combobox.Dropdown>
          <Combobox.Options>{cityDropdownContent}</Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>

      {/* Street autocomplete + house number on same row */}
      <Group align="flex-start" gap="sm">
        <Box style={{ flex: 1 }}>
          <Combobox
            store={streetCombobox}
            onOptionSubmit={(val) => {
              setStreetName(val);
              setHouseNumber('');
              setAptDetails('');
              form.setFieldValue('streetAddress', val);
              suppressNextStreetOpen.current = true;
              streetCombobox.closeDropdown();
            }}
          >
            <Combobox.Target>
              <TextInput
                label="רחוב"
                required={required}
                placeholder={fieldsDisabled ? 'בחר עיר תחילה' : 'הקלד שם רחוב...'}
                value={streetName}
                onChange={(e) => {
                  const value = e.target.value;
                  setStreetName(value);
                  // Changing the street name resets house/apt
                  setHouseNumber('');
                  setAptDetails('');
                  form.setFieldValue('streetAddress', value);
                  streetCombobox.openDropdown();
                }}
                onFocus={() => {
                  if (!fieldsDisabled) {
                    if (suppressNextStreetOpen.current) {
                      suppressNextStreetOpen.current = false;
                    } else {
                      streetCombobox.openDropdown();
                    }
                  }
                }}
                onBlur={() => streetCombobox.closeDropdown()}
                rightSection={streetsLoading ? <Loader size={16} /> : null}
                disabled={fieldsDisabled}
                error={streetInputProps.error}
              />
            </Combobox.Target>
            <Combobox.Dropdown>
              <Combobox.Options>{streetDropdownContent}</Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
        </Box>

        <TextInput
          label="מספר בית"
          required={required}
          placeholder="5"
          style={{ width: 88 }}
          value={houseNumber}
          onChange={(e) => {
            const value = e.target.value;
            setHouseNumber(value);
            form.setFieldValue('streetAddress', buildStreetAddress(streetName, value, aptDetails));
          }}
          disabled={fieldsDisabled}
        />
      </Group>

      {/* Apartment / entrance / floor — optional */}
      <TextInput
        label="דירה / כניסה / קומה"
        placeholder="כניסה א׳, דירה 5"
        value={aptDetails}
        onChange={(e) => {
          const value = e.target.value;
          setAptDetails(value);
          form.setFieldValue('streetAddress', buildStreetAddress(streetName, houseNumber, value));
        }}
        disabled={fieldsDisabled}
      />

      {/* Postal code */}
      <TextInput
        label="מיקוד"
        description="7 ספרות"
        placeholder="1234567"
        value={postalInputProps.value ?? ''}
        onChange={postalInputProps.onChange}
        onBlur={postalInputProps.onBlur}
        error={postalInputProps.error}
        disabled={disabled === true}
      />
    </Stack>
  );
}
