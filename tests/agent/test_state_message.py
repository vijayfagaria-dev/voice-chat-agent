def test_identifiers_reach_the_model_already_masked_so_it_never_has_to_count_digits() -> None:
    from app.agent.state_message import masked_identifier

    assert masked_identifier("serialNumber", {"kind": "imei", "value": "354672110938451"}) == "IMEI ending 8451"
    assert masked_identifier("serialNumber", {"kind": "serial", "value": "C02XL0ABJGH5"}) == "serial number ending JGH5"
    assert masked_identifier("email", "test6@example.com") == "email at example.com"
    assert masked_identifier("deviceType", "laptop") is None
